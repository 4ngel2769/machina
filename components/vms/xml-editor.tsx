'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Code, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface XMLEditorProps {
  vmName: string;
}

export function XMLEditor({ vmName }: XMLEditorProps) {
  const [xmlContent, setXmlContent] = useState('');
  const [originalXml, setOriginalXml] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const fetchXML = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/vms/${vmName}/xml`);
      if (!response.ok) throw new Error('Failed to fetch XML');
      const data = await response.json();
      setXmlContent(data.xml);
      setOriginalXml(data.xml);
    } catch (error) {
      toast.error('Failed to load VM XML');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchXML();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmName]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/vms/${vmName}/xml`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml: xmlContent }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save XML');
      }

      toast.success('VM configuration updated successfully');
      setOriginalXml(xmlContent);
      setIsEditing(false);
      await fetchXML(); // Refresh to get the actual saved XML
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save XML');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setXmlContent(originalXml);
    setIsEditing(false);
    toast.info('Changes discarded');
  };

  const hasChanges = xmlContent !== originalXml;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          XML Configuration
        </CardTitle>
        <CardDescription>
          Edit the VM&apos;s XML configuration directly. Be careful - invalid XML may prevent the VM
          from starting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Toggle Edit Mode */}
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {isEditing ? 'Editing mode - make your changes below' : 'Read-only view'}
              </div>
              {!isEditing && (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Code className="h-4 w-4 mr-2" />
                  Edit XML
                </Button>
              )}
            </div>

            {/* XML Content */}
            {isEditing ? (
              <Textarea
                value={xmlContent}
                onChange={(e) => setXmlContent(e.target.value)}
                className="font-mono text-sm min-h-[500px]"
                spellCheck={false}
              />
            ) : (
              <div className="rounded-md overflow-auto max-h-[600px] border">
                <SyntaxHighlighter
                  language="xml"
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    fontSize: '0.875rem',
                    lineHeight: '1.5',
                  }}
                  showLineNumbers
                >
                  {xmlContent}
                </SyntaxHighlighter>
              </div>
            )}

            {/* Action Buttons */}
            {isEditing && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleReset} disabled={isSaving || !hasChanges}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
