import crypto from 'crypto';
import { execSync } from 'child_process';
import connectDB from '@/lib/db/mongodb';
import { IUserNetwork, IUserNetworkAllocation, UserNetwork } from '@/lib/db/models/UserNetwork';

const clampOctet = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(254, Math.max(2, Number(value)));
};

const BASE_THIRD_OCTET = clampOctet(Number(process.env.USER_VNET_BASE_OCTET), 200);
const SUBNET_MIN = clampOctet(Number(process.env.USER_VNET_MIN_SUBNET), 10);
const SUBNET_MAX = clampOctet(Number(process.env.USER_VNET_MAX_SUBNET), 250);
const NETMASK = '255.255.255.0';

function sanitizeTenantSegment(userId: string): string {
  const sanitized = (userId || 'tenant').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return sanitized.length > 0 ? sanitized : 'tenant';
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0);
}

function intToIp(value: number): string {
  return [24, 16, 8, 0]
    .map((shift) => ((value >> shift) & 0xff).toString())
    .join('.');
}

function buildNetworkMetadata(thirdOctet: number) {
  const networkIp = `10.${BASE_THIRD_OCTET}.${thirdOctet}.0`;
  const gateway = `10.${BASE_THIRD_OCTET}.${thirdOctet}.1`;
  const dhcpStart = `10.${BASE_THIRD_OCTET}.${thirdOctet}.2`;
  const dhcpEnd = `10.${BASE_THIRD_OCTET}.${thirdOctet}.254`;
  const subnetCidr = `${networkIp}/24`;
  return { networkIp, gateway, dhcpStart, dhcpEnd, subnetCidr };
}

function buildNetworkName(userId: string, thirdOctet: number): string {
  const segment = sanitizeTenantSegment(userId);
  return `tenant-${segment.slice(-8)}-${thirdOctet}`;
}

function defineLibvirtNetwork(params: { name: string; gateway: string; networkIp: string; dhcpStart: string; dhcpEnd: string }) {
  const networkXml = `
<network>
  <name>${params.name}</name>
  <bridge name='${params.name}' stp='on' delay='0'/>
  <ip address='${params.gateway}' netmask='${NETMASK}'>
    <dhcp>
      <range start='${params.dhcpStart}' end='${params.dhcpEnd}'/>
    </dhcp>
  </ip>
</network>
  `.trim();

  try {
    execSync(`echo '${networkXml.replace(/'/g, "'\\''")}' | virsh net-define /dev/stdin`, { encoding: 'utf-8' });
  } catch (error) {
    // If the network already exists we carry on, otherwise rethrow
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('already exists')) {
      throw error;
    }
  }

  execSync(`virsh net-start ${params.name}`, { encoding: 'utf-8' });
  execSync(`virsh net-autostart ${params.name}`, { encoding: 'utf-8' });
}

function ensureNetworkIsLive(name: string): void {
  try {
    const info = execSync(`virsh net-info ${name}`, { encoding: 'utf-8' });
    if (!/Active:\s+yes/i.test(info)) {
      execSync(`virsh net-start ${name}`, { encoding: 'utf-8' });
    }
  } catch (error) {
    throw new Error(`Unable to verify virtual network ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function generateMacAddress(userId: string, vmName: string): string {
  const hash = crypto.createHash('sha256').update(`${userId}-${vmName}`).digest();
  const octets = [hash[0], hash[1], hash[2]]
    .map((value) => value.toString(16).padStart(2, '0'));
  return `52:54:${octets.join(':')}`;
}

function findNextIp(network: IUserNetwork): string {
  const [subnetBase] = network.subnetCidr.split('/');
  const baseInt = ipToInt(subnetBase);
  const used = new Set(network.allocations.map((alloc) => alloc.ipAddress));
  const startInt = baseInt + 10;
  const endInt = baseInt + 254;

  for (let candidate = startInt; candidate <= endInt; candidate++) {
    const ip = intToIp(candidate);
    if (!used.has(ip)) {
      return ip;
    }
  }

  throw new Error('No IP addresses remaining in tenant virtual network');
}

function syncDhcpReservation(networkName: string, allocation: IUserNetworkAllocation): void {
  ensureNetworkIsLive(networkName);
  const hostXml = `<host mac="${allocation.macAddress}" name="${allocation.vmName}" ip="${allocation.ipAddress}"/>`;
  const escapedHostXml = hostXml.replace(/"/g, '\\"');

  try {
    execSync(
      `virsh net-update ${networkName} delete ip-dhcp-host --live --config --xml "${escapedHostXml}"`,
      { stdio: 'ignore' }
    );
  } catch {
    // Ignore if entry did not exist
  }

  execSync(
    `virsh net-update ${networkName} add-last ip-dhcp-host --live --config --xml "${escapedHostXml}"`,
    { encoding: 'utf-8' }
  );
}

export async function ensureUserNetwork(userId: string, username?: string): Promise<IUserNetwork> {
  await connectDB();
  let record = await UserNetwork.findOne({ userId });
  if (record) {
    ensureNetworkIsLive(record.networkName);
    return record;
  }

  const existing = await UserNetwork.find({}, 'subnetCidr');
  const usedCidrs = new Set(existing.map((net) => net.subnetCidr));

  let allocationMeta: ReturnType<typeof buildNetworkMetadata> | null = null;
  let chosenOctet = SUBNET_MIN;

  for (let octet = SUBNET_MIN; octet <= SUBNET_MAX; octet++) {
    const metadata = buildNetworkMetadata(octet);
    if (!usedCidrs.has(metadata.subnetCidr)) {
      allocationMeta = metadata;
      chosenOctet = octet;
      break;
    }
  }

  if (!allocationMeta) {
    throw new Error('No remaining tenant network capacity. Please contact an administrator.');
  }

  const networkName = buildNetworkName(userId, chosenOctet);
  defineLibvirtNetwork({
    name: networkName,
    gateway: allocationMeta.gateway,
    networkIp: allocationMeta.networkIp,
    dhcpStart: allocationMeta.dhcpStart,
    dhcpEnd: allocationMeta.dhcpEnd,
  });

  record = await UserNetwork.create({
    userId,
    username,
    networkName,
    subnetCidr: allocationMeta.subnetCidr,
    gateway: allocationMeta.gateway,
    dhcpRange: {
      start: allocationMeta.dhcpStart,
      end: allocationMeta.dhcpEnd,
    },
    allocations: [],
  });

  return record;
}

export async function assignStaticIP(
  userId: string,
  vmName: string,
  username?: string
): Promise<{ networkName: string; ipAddress: string; macAddress: string }> {
  const network = await ensureUserNetwork(userId, username);
  let allocation = network.allocations.find((entry) => entry.vmName === vmName);

  if (!allocation) {
    allocation = {
      vmName,
      ipAddress: findNextIp(network),
      macAddress: generateMacAddress(userId, vmName),
      createdAt: new Date(),
    };
    network.allocations.push(allocation);
    await network.save();
  }

  syncDhcpReservation(network.networkName, allocation);
  return {
    networkName: network.networkName,
    ipAddress: allocation.ipAddress,
    macAddress: allocation.macAddress,
  };
}

export async function releaseStaticIP(userId: string, vmName: string): Promise<void> {
  await connectDB();
  const network = await UserNetwork.findOne({ userId });
  if (!network) return;

  const allocation = network.allocations.find((entry) => entry.vmName === vmName);
  if (!allocation) return;

  network.allocations = network.allocations.filter((entry) => entry.vmName !== vmName);
  await network.save();

  const hostXml = `<host mac="${allocation.macAddress}" name="${allocation.vmName}" ip="${allocation.ipAddress}"/>`;
  const escapedHostXml = hostXml.replace(/"/g, '\\"');

  try {
    execSync(
      `virsh net-update ${network.networkName} delete ip-dhcp-host --live --config --xml "${escapedHostXml}"`,
      { stdio: 'ignore' }
    );
  } catch {
    // Entry may already be gone; ignore.
  }
}
