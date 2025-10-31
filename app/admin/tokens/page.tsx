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
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Calendar,
  User,
  Coins,
  Play,
  Pause,
  Ban,
} from 'lucide-react';
import { TokenRequest } from '@/lib/token-requests';
import { UserContract } from '@/lib/user-contracts';
import { PageLoading } from '@/components/loading-skeletons';
import { formatDistanceToNow } from 'date-fns';

export default function TokenManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [requests, setRequests] = useState<TokenRequest[]>([]);
  const [contracts, setContracts] = useState<UserContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<TokenRequest | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [showCreateContractDialog, setShowCreateContractDialog] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('all');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [contractForm, setContractForm] = useState({
    userId: '',
    username: '',
    tokensPerMonth: 100,
    durationMonths: 1,
    notes: '',
    initialRefill: true,
  });

  // Redirect if not admin
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
      toast({
        title: 'Access Denied',
        description: 'Only administrators can access this page.',
        variant: 'destructive',
      });
    }
  }, [session, status, router, toast]);

  const fetchRequests = async () => {
    try {
      const filterParam = filter === 'all' ? '' : `?filter=${filter}`;
      const response = await fetch(`/api/token-requests${filterParam}`);
      if (!response.ok) throw new Error('Failed to fetch requests');
      const data = await response.json();
      setRequests(data);
    } catch (error) {
      console.error('Error fetching requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load token requests',
        variant: 'destructive',
      });
    }
  };

  const fetchContracts = async () => {
    try {
      const response = await fetch('/api/admin/contracts');
      if (!response.ok) throw new Error('Failed to fetch contracts');
      const data = await response.json();
      setContracts(data);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load contracts',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.role === 'admin') {
      fetchRequests();
      fetchContracts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, filter]);

  const handleApprove = async (requestId: string) => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/token-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action: 'approve', notes: reviewNotes }),
      });

      if (!response.ok) throw new Error('Failed to approve request');

      toast({
        title: 'Success',
        description: 'Token request approved',
      });

      setShowReviewDialog(false);
      setReviewNotes('');
      fetchRequests();
    } catch (error) {
      console.error('Error approving request:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve request',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeny = async (requestId: string) => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/token-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action: 'deny', notes: reviewNotes }),
      });

      if (!response.ok) throw new Error('Failed to deny request');

      toast({
        title: 'Success',
        description: 'Token request denied',
      });

      setShowReviewDialog(false);
      setReviewNotes('');
      fetchRequests();
    } catch (error) {
      console.error('Error denying request:', error);
      toast({
        title: 'Error',
        description: 'Failed to deny request',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateContract = async () => {
    if (!contractForm.userId || !contractForm.username) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contractForm),
      });

      if (!response.ok) throw new Error('Failed to create contract');

      toast({
        title: 'Success',
        description: 'Contract created successfully',
      });

      setShowCreateContractDialog(false);
      setContractForm({
        userId: '',
        username: '',
        tokensPerMonth: 100,
        durationMonths: 1,
        notes: '',
        initialRefill: true,
      });
      fetchContracts();
    } catch (error) {
      console.error('Error creating contract:', error);
      toast({
        title: 'Error',
        description: 'Failed to create contract',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateContractStatus = async (contractId: string, status: string) => {
    try {
      const response = await fetch('/api/admin/contracts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, status }),
      });

      if (!response.ok) throw new Error('Failed to update contract');

      toast({
        title: 'Success',
        description: 'Contract status updated',
      });

      fetchContracts();
    } catch (error) {
      console.error('Error updating contract:', error);
      toast({
        title: 'Error',
        description: 'Failed to update contract',
        variant: 'destructive',
      });
    }
  };

  if (status === 'loading' || loading) {
    return <PageLoading />;
  }

  if (session?.user?.role !== 'admin') {
    return null;
  }

  const pendingRequests = requests.filter(r => r.status === 'pending');

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Token Management</h1>
        <p className="text-muted-foreground mt-1">
          Manage token requests and user contracts
        </p>
      </div>

      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList>
          <TabsTrigger value="requests" className="relative">
            Token Requests
            {pendingRequests.length > 0 && (
              <Badge className="ml-2" variant="default">
                {pendingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
        </TabsList>

        {/* Token Requests Tab */}
        <TabsContent value="requests" className="space-y-4">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All Requests</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="denied">Denied</TabsTrigger>
            </TabsList>

            <TabsContent value={filter} className="space-y-4 mt-4">
          <div className="grid gap-4">
            {requests.map((request) => (
              <Card key={request.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        {request.username}
                      </CardTitle>
                      <CardDescription>
                        Requested {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
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
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-yellow-500" />
                    <span className="text-2xl font-bold">{request.amount}</span>
                    <span className="text-muted-foreground">tokens</span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Reason:</Label>
                    <p className="text-sm text-muted-foreground">{request.reason}</p>
                  </div>

                  {request.adminNotes && (
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Admin Notes:</Label>
                      <p className="text-sm text-muted-foreground">{request.adminNotes}</p>
                    </div>
                  )}

                  {request.reviewedBy && (
                    <p className="text-sm text-muted-foreground">
                      Reviewed by {request.reviewedBy} • {formatDistanceToNow(new Date(request.reviewedAt!), { addSuffix: true })}
                    </p>
                  )}

                  {request.status === 'pending' && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={() => {
                          setSelectedRequest(request);
                          setReviewNotes('');
                          setShowReviewDialog(true);
                        }}
                        className="flex-1"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Review
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {requests.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No token requests found
                </CardContent>
              </Card>
            )}
          </div>
          </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Contracts Tab */}
        <TabsContent value="contracts" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateContractDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Contract
            </Button>
          </div>

          <div className="grid gap-4">
            {contracts.map((contract) => (
              <Card key={contract.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        {contract.username}
                      </CardTitle>
                      <CardDescription>
                        Created by {contract.createdBy} • {formatDistanceToNow(new Date(contract.createdAt), { addSuffix: true })}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {contract.status === 'active' ? (
                        <Badge variant="default">
                          <Play className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : contract.status === 'paused' ? (
                        <Badge variant="secondary">
                          <Pause className="h-3 w-3 mr-1" />
                          Paused
                        </Badge>
                      ) : contract.status === 'cancelled' ? (
                        <Badge variant="destructive">
                          <Ban className="h-3 w-3 mr-1" />
                          Cancelled
                        </Badge>
                      ) : (
                        <Badge variant="outline">Expired</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Tokens per Month</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Coins className="h-4 w-4 text-yellow-500" />
                        <span className="font-semibold">{contract.tokensPerMonth}</span>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm">Duration</Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Calendar className="h-4 w-4" />
                        <span className="font-semibold">{contract.durationMonths} months</span>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm">Next Refill</Label>
                      <p className="text-sm mt-1">
                        {formatDistanceToNow(new Date(contract.nextRefillDate), { addSuffix: true })}
                      </p>
                    </div>

                    <div>
                      <Label className="text-sm">Total Refills</Label>
                      <p className="text-sm font-semibold mt-1">{contract.totalRefills}</p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm">Contract Period</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {new Date(contract.startDate).toLocaleDateString()} - {new Date(contract.endDate).toLocaleDateString()}
                    </p>
                  </div>

                  {contract.notes && (
                    <div>
                      <Label className="text-sm">Notes</Label>
                      <p className="text-sm text-muted-foreground mt-1">{contract.notes}</p>
                    </div>
                  )}

                  {contract.status === 'active' && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpdateContractStatus(contract.id, 'paused')}
                      >
                        <Pause className="h-4 w-4 mr-2" />
                        Pause
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleUpdateContractStatus(contract.id, 'cancelled')}
                      >
                        <Ban className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  )}

                  {contract.status === 'paused' && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleUpdateContractStatus(contract.id, 'active')}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}

            {contracts.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No contracts found
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Review Request Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Token Request</DialogTitle>
            <DialogDescription>
              Request from {selectedRequest?.username} for {selectedRequest?.amount} tokens
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Reason:</Label>
              <p className="text-sm text-muted-foreground mt-1">{selectedRequest?.reason}</p>
            </div>

            <div>
              <Label>Admin Notes (optional)</Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add notes for this decision..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReviewDialog(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedRequest && handleDeny(selectedRequest.id)}
              disabled={submitting}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Deny
            </Button>
            <Button
              onClick={() => selectedRequest && handleApprove(selectedRequest.id)}
              disabled={submitting}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Contract Dialog */}
      <Dialog open={showCreateContractDialog} onOpenChange={setShowCreateContractDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User Contract</DialogTitle>
            <DialogDescription>
              Set up a monthly token subscription for a user
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>User ID *</Label>
                <Input
                  value={contractForm.userId}
                  onChange={(e) => setContractForm({ ...contractForm, userId: e.target.value })}
                  placeholder="user-123"
                />
              </div>

              <div>
                <Label>Username *</Label>
                <Input
                  value={contractForm.username}
                  onChange={(e) => setContractForm({ ...contractForm, username: e.target.value })}
                  placeholder="john_doe"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tokens per Month *</Label>
                <Input
                  type="number"
                  value={contractForm.tokensPerMonth}
                  onChange={(e) => setContractForm({ ...contractForm, tokensPerMonth: parseInt(e.target.value) || 0 })}
                  min="1"
                />
              </div>

              <div>
                <Label>Duration (Months) *</Label>
                <Input
                  type="number"
                  value={contractForm.durationMonths}
                  onChange={(e) => setContractForm({ ...contractForm, durationMonths: parseInt(e.target.value) || 1 })}
                  min="1"
                />
              </div>
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={contractForm.notes}
                onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })}
                placeholder="Contract details..."
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="initialRefill"
                checked={contractForm.initialRefill}
                onChange={(e) => setContractForm({ ...contractForm, initialRefill: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="initialRefill" className="text-sm">
                Add initial tokens immediately
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateContractDialog(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateContract} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Contract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
