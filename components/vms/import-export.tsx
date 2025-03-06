'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Download, Upload, FileText, HardDrive } from 'lucide-react';
import { toast } from 'sonner';

interface ImportExportProps {
  vmName?: string;
}

export function ImportExport({ vmName }: ImportExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importXML, setImportXML] = useState('');
  const [importVMName, setImportVMName] = useState('');
  const [exportFormat, setExportFormat] = useState<'xml' | 'ova'>('xml');

  const handleExportXML = async () => {
    if (!vmName) {
      toast.error('No VM selected');
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch(`/api/vms/${vmName}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: exportFormat }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to export VM');
      }

      const data = await response.json();

      // Download XML file
      const blob = new Blob([data.xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${vmName}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${vmName}.xml successfully`);

      if (data.disks && data.disks.length > 0) {
        toast.info(
          `Disk images: ${data.disks.join(', ')}. Copy these files manually.`,
          { duration: 10000 }
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export VM');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportXML = async () => {
    if (!importXML || !importVMName) {
      toast.error('Please provide both XML content and a new VM name');
      return;
    }

    setIsImporting(true);
    try {
      const response = await fetch('/api/vms/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xml: importXML,
          name: importVMName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to import VM');
      }

      const result = await response.json();
      toast.success(result.message);
      
      // Clear form
      setImportXML('');
      setImportVMName('');

      if (result.note) {
        toast.info(result.note, { duration: 8000 });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import VM');
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportXML(content);

      // Try to extract VM name from XML
      const nameMatch = content.match(/<name>([^<]+)<\/name>/);
      if (nameMatch && nameMatch[1]) {
        setImportVMName(`${nameMatch[1]}-imported`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Import / Export
        </CardTitle>
        <CardDescription>
          Export VM configuration or import from XML files
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="export">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-4">
            {!vmName ? (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Select a VM to export</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Virtual Machine</Label>
                  <div className="rounded-md bg-muted p-3 text-sm font-medium">
                    {vmName}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Export Format</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={exportFormat === 'xml' ? 'default' : 'outline'}
                      onClick={() => setExportFormat('xml')}
                      className="flex-1"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      XML Only
                    </Button>
                    <Button
                      variant={exportFormat === 'ova' ? 'default' : 'outline'}
                      onClick={() => setExportFormat('ova')}
                      className="flex-1"
                      disabled
                    >
                      <HardDrive className="h-4 w-4 mr-2" />
                      OVA (Coming Soon)
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border border-blue-500/50 bg-blue-500/10 p-3 text-sm">
                  <strong>Note:</strong> This exports the VM configuration (XML). Disk images must
                  be copied manually from their locations.
                </div>

                <Button onClick={handleExportXML} disabled={isExporting} className="w-full">
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Export VM Configuration
                    </>
                  )}
                </Button>
              </>
            )}
          </TabsContent>

          {/* Import Tab */}
          <TabsContent value="import" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="upload-xml">Upload XML File</Label>
              <Input
                id="upload-xml"
                type="file"
                accept=".xml"
                onChange={handleFileUpload}
              />
              <p className="text-xs text-muted-foreground">
                Or paste the XML content below
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-xml">VM Configuration (XML)</Label>
              <Textarea
                id="import-xml"
                value={importXML}
                onChange={(e) => setImportXML(e.target.value)}
                placeholder="<domain type='kvm'>
  <name>my-vm</name>
  ...
</domain>"
                className="font-mono text-sm min-h-[200px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-name">New VM Name</Label>
              <Input
                id="import-name"
                value={importVMName}
                onChange={(e) => setImportVMName(e.target.value)}
                placeholder="imported-vm"
              />
              <p className="text-xs text-muted-foreground">
                The VM will be imported with this name
              </p>
            </div>

            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
              <strong>Important:</strong> Make sure disk image paths in the XML point to valid
              locations on this system. You may need to copy disk files manually before importing.
            </div>

            <Button
              onClick={handleImportXML}
              disabled={isImporting || !importXML || !importVMName}
              className="w-full"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import VM
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
