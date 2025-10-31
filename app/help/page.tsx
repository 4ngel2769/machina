'use client';

import { useState } from 'react';
import { 
  Book, 
  FileQuestion, 
  Lightbulb, 
  Terminal, 
  Shield,
  Zap,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Code,
  Keyboard
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const faqItems = [
    {
      question: 'How do I create a new virtual machine?',
      answer: 'Navigate to the Virtual Machines page and click the "Create VM" button. Fill in the required details like name, memory, CPU, and select an ISO image. Click "Create" to start the VM creation process.',
      tags: ['vms', 'creation']
    },
    {
      question: 'What are resource quotas and how do they work?',
      answer: 'Resource quotas limit the number of VMs and containers you can create based on your plan. Free plan users can create up to 2 VMs and 3 containers, while Pro plan users get 10 VMs and 20 containers. Enterprise plans have custom limits.',
      tags: ['quotas', 'plans']
    },
    {
      question: 'How do I upgrade my plan?',
      answer: 'Go to Settings > Subscription and select your desired plan. You can upgrade at any time and the changes will take effect immediately. Your existing resources will not be affected.',
      tags: ['billing', 'plans']
    },
    {
      question: 'Can I access my containers via SSH?',
      answer: 'Yes! Each container exposes SSH access. You can find the SSH connection details on the container detail page. Use the provided command to connect directly to your container.',
      tags: ['containers', 'ssh']
    },
    {
      question: 'How do I monitor resource usage?',
      answer: 'The Dashboard provides real-time stats for CPU, memory, and disk usage. You can also view detailed metrics on individual container and VM pages. Historical data is available for the last 24 hours.',
      tags: ['monitoring', 'stats']
    },
    {
      question: 'What happens when I delete a VM or container?',
      answer: 'Deleting a resource is permanent and cannot be undone. All data associated with the VM or container will be lost. Make sure to backup any important data before deletion.',
      tags: ['deletion', 'data']
    },
    {
      question: 'How do I use keyboard shortcuts?',
      answer: 'Press Cmd+K (Mac) or Ctrl+K (Windows/Linux) to open the command palette. From there you can quickly navigate to any page, search for resources, and perform quick actions like starting or stopping VMs and containers.',
      tags: ['shortcuts', 'navigation']
    },
    {
      question: 'Can I customize VM resources after creation?',
      answer: 'Not currently supported. You need to create a new VM with the desired specifications. We recommend planning your resource allocation before creation.',
      tags: ['vms', 'resources']
    },
    {
      question: 'What are tokens and how do they work?',
      answer: 'Tokens are the virtual currency used in Machina. Each plan comes with a token balance that automatically renews. Tokens can be used for premium features, additional resources, or add-ons. Admins can add or remove tokens from user accounts.',
      tags: ['tokens', 'billing', 'plans']
    },
    {
      question: 'How do I check my current plan and token balance?',
      answer: 'Your current plan and token balance are displayed in the admin dashboard if you\'re an admin, or you can check with your administrator. Token usage and plan details are also visible in the Settings page.',
      tags: ['tokens', 'plans', 'account']
    },
    {
      question: 'Can I snapshot my VMs?',
      answer: 'Yes! VM snapshots allow you to save the current state of a virtual machine. You can create snapshots, revert to previous states, and manage multiple snapshots per VM from the VM detail page.',
      tags: ['vms', 'snapshots', 'backup']
    },
    {
      question: 'What network modes are available for VMs?',
      answer: 'VMs support NAT (default), bridged, and host-only networking. NAT provides internet access through the host, bridged gives the VM a direct network presence, and host-only restricts communication to the host machine.',
      tags: ['vms', 'network', 'networking']
    },
    {
      question: 'How do I access the VNC console?',
      answer: 'Click on any VM card or navigate to the VM detail page, then click the "Console" button. This opens a browser-based VNC viewer for direct graphical access to your VM. No additional software required!',
      tags: ['vms', 'vnc', 'console']
    }
  ];

  const filteredFaq = faqItems.filter(item => 
    item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="container max-w-5xl py-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Help & Documentation</h1>
        <p className="text-muted-foreground">
          Everything you need to know about using Machina
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for help articles, guides, and FAQs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="getting-started" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="getting-started">
            <Lightbulb className="h-4 w-4 mr-2" />
            Getting Started
          </TabsTrigger>
          <TabsTrigger value="features">
            <Zap className="h-4 w-4 mr-2" />
            Features
          </TabsTrigger>
          <TabsTrigger value="shortcuts">
            <Keyboard className="h-4 w-4 mr-2" />
            Shortcuts
          </TabsTrigger>
          <TabsTrigger value="troubleshooting">
            <Terminal className="h-4 w-4 mr-2" />
            Troubleshooting
          </TabsTrigger>
          <TabsTrigger value="faq">
            <FileQuestion className="h-4 w-4 mr-2" />
            FAQ
          </TabsTrigger>
        </TabsList>

        {/* Getting Started */}
        <TabsContent value="getting-started" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Welcome to Machina!</CardTitle>
              <CardDescription>
                Your complete guide to getting started with container and VM management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">1</span>
                  Create Your First Container
                </h3>
                <p className="text-sm text-muted-foreground ml-8">
                  Navigate to the <strong>Containers</strong> page from the sidebar. Click <strong>Create Container</strong> and provide a name, select a Docker image, and configure your ports. Your container will be ready in seconds!
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">2</span>
                  Launch Your First Virtual Machine
                </h3>
                <p className="text-sm text-muted-foreground ml-8">
                  Go to <strong>Virtual Machines</strong> and click <strong>Create VM</strong>. Choose your OS ISO, allocate memory and CPU cores, and start the VM. Access it via VNC console or SSH.
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">3</span>
                  Monitor Your Resources
                </h3>
                <p className="text-sm text-muted-foreground ml-8">
                  The <strong>Dashboard</strong> provides real-time insights into your system resources, running containers, and VMs. Track CPU, memory, and disk usage at a glance.
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">4</span>
                  Manage Your Account
                </h3>
                <p className="text-sm text-muted-foreground ml-8">
                  Visit <strong>Settings</strong> to update your profile, change your password, manage API tokens, and upgrade your plan for more resources.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features */}
        <TabsContent value="features" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Container Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <ul className="list-disc list-inside space-y-1">
                  <li>Deploy containers from Docker Hub images</li>
                  <li>Configure port mappings and environment variables</li>
                  <li>Real-time logs and terminal access</li>
                  <li>Start, stop, restart, and delete containers</li>
                  <li>Monitor CPU, memory, and network usage</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Virtual Machines
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <ul className="list-disc list-inside space-y-1">
                  <li>Create VMs from ISO images</li>
                  <li>Customize CPU, memory, and disk size</li>
                  <li>VNC console access for direct interaction</li>
                  <li>Snapshots and backups (coming soon)</li>
                  <li>Full lifecycle management</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Command Palette
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Press <kbd className="px-2 py-1 bg-muted rounded text-xs">Cmd+K</kbd> or <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+K</kbd> to open the command palette.</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Quick navigation to any page</li>
                  <li>Search for containers and VMs</li>
                  <li>Start/stop resources instantly</li>
                  <li>Keyboard-first workflow</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Book className="h-5 w-5" />
                  Resource Quotas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Plans determine your resource limits:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><Badge variant="outline">Free</Badge> 2 VMs, 3 containers</li>
                  <li><Badge variant="outline">Pro</Badge> 10 VMs, 20 containers</li>
                  <li><Badge variant="outline">Enterprise</Badge> Custom limits</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Keyboard Shortcuts */}
        <TabsContent value="shortcuts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Keyboard Shortcuts</CardTitle>
              <CardDescription>
                Speed up your workflow with these keyboard shortcuts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Global</h3>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Open command palette</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl</kbd>
                      <span className="text-muted-foreground">+</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">K</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Search</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl</kbd>
                      <span className="text-muted-foreground">+</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">F</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Toggle sidebar</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl</kbd>
                      <span className="text-muted-foreground">+</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">B</kbd>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Navigation</h3>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Go to Dashboard</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Shift</kbd>
                      <span className="text-muted-foreground">+</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">D</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Go to Containers</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Shift</kbd>
                      <span className="text-muted-foreground">+</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">C</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Go to Virtual Machines</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Shift</kbd>
                      <span className="text-muted-foreground">+</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">V</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Go to Settings</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Shift</kbd>
                      <span className="text-muted-foreground">+</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">S</kbd>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Actions</h3>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Create new (context-aware)</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Shift</kbd>
                      <span className="text-muted-foreground">+</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">N</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Refresh current page</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Shift</kbd>
                      <span className="text-muted-foreground">+</span>
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">R</kbd>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm">Open help</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">?</kbd>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                <p className="font-medium mb-2">💡 Tip</p>
                <p>Use the command palette (<kbd className="px-1.5 py-0.5 bg-background rounded text-xs">Ctrl+K</kbd>) for the fastest way to navigate and perform actions. It&apos;s context-aware and shows the most relevant options based on your current page.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Troubleshooting */}
        <TabsContent value="troubleshooting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Common Issues & Solutions</CardTitle>
              <CardDescription>
                Quick fixes for the most common problems
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h4 className="font-semibold">Container won&apos;t start</h4>
                <p className="text-sm text-muted-foreground">
                  Check the logs for error messages. Common issues include port conflicts, invalid image names, or resource limitations. Verify that the Docker image exists and is accessible.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="font-semibold">VM stuck in &quot;Creating&quot; state</h4>
                <p className="text-sm text-muted-foreground">
                  This usually indicates insufficient system resources. Check the host system&apos;s available memory and CPU. You may need to stop other VMs or wait for resources to become available.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="font-semibold">Can&apos;t connect to container via SSH</h4>
                <p className="text-sm text-muted-foreground">
                  Ensure the container has SSH installed and running. Check that port 22 is mapped correctly. Verify firewall rules aren&apos;t blocking the connection.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="font-semibold">Quota exceeded error</h4>
                <p className="text-sm text-muted-foreground">
                  You&apos;ve reached your plan&apos;s resource limit. Delete unused containers or VMs, or upgrade your plan in Settings &gt; Subscription.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="font-semibold">Dashboard stats not updating</h4>
                <p className="text-sm text-muted-foreground">
                  Try refreshing the page. If the issue persists, check if the system monitoring service is running. Contact support if the problem continues.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAQ */}
        <TabsContent value="faq" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
              <CardDescription>
                {filteredFaq.length} question{filteredFaq.length !== 1 ? 's' : ''} found
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredFaq.map((item, index) => (
                <div key={index} className="border rounded-lg">
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-4 h-auto font-normal"
                    onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                  >
                    <span className="text-left font-medium">{item.question}</span>
                    {expandedFaq === index ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                  </Button>
                  {expandedFaq === index && (
                    <div className="px-4 pb-4 space-y-3">
                      <p className="text-sm text-muted-foreground">{item.answer}</p>
                      <div className="flex gap-2">
                        {item.tags.map((tag, tagIndex) => (
                          <Badge key={tagIndex} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {filteredFaq.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No results found for &quot;{searchQuery}&quot;</p>
                  <p className="text-sm mt-2">Try different keywords or browse all categories</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Additional Resources */}
      <Card>
        <CardHeader>
          <CardTitle>Need More Help?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If you can&apos;t find what you&apos;re looking for, we&apos;re here to help!
          </p>
          <div className="flex gap-4">
            <Button variant="outline">
              <Book className="h-4 w-4 mr-2" />
              View Full Documentation
            </Button>
            <Button variant="outline">
              Contact Support
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
