'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Coins,
  Plus,
  Clock,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  CreditCard,
} from 'lucide-react';
import { TokenRequest } from '@/lib/token-requests';
import { UserContract } from '@/lib/user-contracts';
import { formatDistanceToNow } from 'date-fns';
import { PageLoading } from '@/components/loading-skeletons';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [tokenBalance, setTokenBalance] = useState(0);
  const [requests, setRequests] = useState<TokenRequest[]>([]);
  const [contracts, setContracts] = useState<UserContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [requestForm, setRequestForm] = useState({
    amount: 100,
    reason: '',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const fetchData = async () => {
    try {
      // Fetch token balance via API
      if (session?.user?.id) {
        const quotaResponse = await fetch(`/api/admin/quotas?userId=${session.user.id}`);
        if (quotaResponse.ok) {
          const quotaData = await quotaResponse.json();
          if (quotaData && quotaData.length > 0) {
            setTokenBalance(quotaData[0].tokenBalance || 0);
          }
        }
      }

      // Fetch user requests
      const reqResponse = await fetch('/api/token-requests');
      if (reqResponse.ok) {
        const reqData = await reqResponse.json();
        setRequests(reqData);
      }

      // Fetch user contracts
      const contractResponse = await fetch('/api/admin/contracts');
      if (contractResponse.ok) {
        const contractData = await contractResponse.json();
        setContracts(contractData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleRequestTokens = async () => {
    if (!requestForm.reason || requestForm.amount <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid amount and reason',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/token-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestForm),
      });

      if (!response.ok) throw new Error('Failed to create request');

      toast({
        title: 'Success',
        description: 'Token request submitted successfully',
      });

      setShowRequestDialog(false);
      setRequestForm({ amount: 100, reason: '' });
      fetchData();
    } catch (error) {
      console.error('Error creating request:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit token request',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading' || loading) {
    return <PageLoading />;
  }

  if (!session?.user) {
    return null;
  }

  const activeContracts = contracts.filter(c => c.status === 'active');
  const pendingRequests = requests.filter(r => r.status === 'pending');

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Profile</h1>
        <p className="text-muted-foreground mt-1">
          Manage your tokens and subscriptions
        </p>
      </div>

      {/* Token Balance Card */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="h-6 w-6 text-yellow-500" />
              Token Balance
            </div>
            <Button onClick={() => setShowRequestDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Request Tokens
            </Button>
          </CardTitle>
          <CardDescription>Your available tokens for resource allocation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold">{tokenBalance.toLocaleString()}</span>
            <span className="text-2xl text-muted-foreground">tokens</span>
          </div>

          {pendingRequests.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 text-blue-500" />
                <span className="font-medium">
                  {pendingRequests.length} pending request{pendingRequests.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Active Contracts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Active Subscriptions ({activeContracts.length})
            </CardTitle>
            <CardDescription>Monthly token contracts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeContracts.map((contract) => {
                const nextRefill = new Date(contract.nextRefillDate);
                const endDate = new Date(contract.endDate);
                const now = new Date();
                const totalDuration = endDate.getTime() - new Date(contract.startDate).getTime();
                const elapsed = now.getTime() - new Date(contract.startDate).getTime();
                const progress = Math.min((elapsed / totalDuration) * 100, 100);

                return (
                  <div key={contract.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-yellow-500" />
                        <span className="font-semibold">{contract.tokensPerMonth} tokens/month</span>
                      </div>
                      <Badge variant="default">Active</Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Next refill:</span>
                        <span>{formatDistanceToNow(nextRefill, { addSuffix: true })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contract ends:</span>
                        <span>{formatDistanceToNow(endDate, { addSuffix: true })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total refills:</span>
                        <span>{contract.totalRefills}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Contract progress</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} />
                    </div>

                    {contract.notes && (
                      <p className="text-xs text-muted-foreground italic">{contract.notes}</p>
                    )}
                  </div>
                );
              })}

              {activeContracts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No active subscriptions</p>
                  <p className="text-sm">Contact an administrator to set up a monthly plan</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Token Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Token Requests ({requests.length})
            </CardTitle>
            <CardDescription>Your token request history</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {requests.map((request) => (
                <div key={request.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-yellow-500" />
                      <span className="font-semibold">{request.amount} tokens</span>
                    </div>
                    {request.status === 'pending' ? (
                      <Badge variant="secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    ) : request.status === 'approved' ? (
                      <Badge variant="default">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Approved
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        Denied
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2">{request.reason}</p>

                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                  </div>

                  {request.adminNotes && (
                    <div className="text-sm bg-muted p-2 rounded">
                      <span className="font-medium">Admin: </span>
                      {request.adminNotes}
                    </div>
                  )}
                </div>
              ))}

              {requests.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No token requests yet</p>
                  <p className="text-sm">Click &quot;Request Tokens&quot; to submit your first request</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Request Tokens Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Tokens</DialogTitle>
            <DialogDescription>
              Submit a request to add tokens to your account. An administrator will review it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Amount *</Label>
              <Input
                type="number"
                value={requestForm.amount}
                onChange={(e) => setRequestForm({ ...requestForm, amount: parseInt(e.target.value) || 0 })}
                min="1"
                placeholder="e.g., 100"
              />
              <p className="text-xs text-muted-foreground mt-1">
                How many tokens do you need?
              </p>
            </div>

            <div>
              <Label>Reason *</Label>
              <Textarea
                value={requestForm.reason}
                onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                placeholder="Explain why you need these tokens..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Help administrators understand your request
              </p>
            </div>

            <div className="bg-muted p-3 rounded-lg text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 text-blue-500" />
                <div>
                  <p className="font-medium">Current Balance: {tokenBalance.toLocaleString()} tokens</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Your request will be reviewed by an administrator. You&apos;ll be notified once it&apos;s approved or denied.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRequestDialog(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleRequestTokens} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
