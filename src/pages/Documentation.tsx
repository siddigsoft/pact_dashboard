import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, 
  Download, 
  FileDown, 
  BookOpen, 
  List, 
  Workflow, 
  Users, 
  DollarSign,
  Smartphone,
  HelpCircle,
  ChevronRight,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { 
  generateUserManualPDF, 
  generateUserManualDOCX, 
  getDocumentationSections, 
  getWorkflowSteps 
} from '@/lib/docs-export';

export default function Documentation() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [exportType, setExportType] = useState<'pdf' | 'docx' | null>(null);

  const sections = getDocumentationSections();
  const workflowSteps = getWorkflowSteps();

  const handleExportPDF = async () => {
    try {
      setExporting(true);
      setExportType('pdf');
      await new Promise(resolve => setTimeout(resolve, 100));
      generateUserManualPDF();
      toast({
        title: "PDF Generated",
        description: "User manual has been downloaded as PDF",
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Export Failed",
        description: "Unable to generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
      setExportType(null);
    }
  };

  const handleExportDOCX = async () => {
    try {
      setExporting(true);
      setExportType('docx');
      await generateUserManualDOCX();
      toast({
        title: "Word Document Generated",
        description: "User manual has been downloaded as DOCX",
      });
    } catch (error) {
      console.error('DOCX export error:', error);
      toast({
        title: "Export Failed",
        description: "Unable to generate Word document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
      setExportType(null);
    }
  };

  const workflowPhases = [
    { 
      name: 'Setup & Planning', 
      steps: workflowSteps.filter(s => s.step.startsWith('A') || s.step.startsWith('B') || s.step.startsWith('C') || s.step.startsWith('D')),
      icon: Users,
      color: 'bg-blue-500'
    },
    { 
      name: 'MMP Lifecycle', 
      steps: workflowSteps.filter(s => s.step.startsWith('E') || s.step.startsWith('F')),
      icon: FileText,
      color: 'bg-green-500'
    },
    { 
      name: 'Dispatch & Claiming', 
      steps: workflowSteps.filter(s => s.step.startsWith('G') || s.step.startsWith('H')),
      icon: Workflow,
      color: 'bg-purple-500'
    },
    { 
      name: 'Field Operations', 
      steps: workflowSteps.filter(s => s.step.startsWith('I') || s.step.startsWith('J')),
      icon: Smartphone,
      color: 'bg-orange-500'
    },
    { 
      name: 'Financial Processing', 
      steps: workflowSteps.filter(s => s.step.startsWith('K')),
      icon: DollarSign,
      color: 'bg-emerald-500'
    }
  ];

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" data-testid="page-title">
            <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            Documentation
          </h1>
          <p className="text-muted-foreground mt-1">
            Complete user manual and workflow documentation
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={handleExportPDF}
            disabled={exporting}
            variant="outline"
            className="gap-2"
            data-testid="button-export-pdf"
          >
            <FileDown className="h-4 w-4" />
            {exporting && exportType === 'pdf' ? 'Generating...' : 'Export PDF'}
          </Button>
          <Button 
            onClick={handleExportDOCX}
            disabled={exporting}
            className="gap-2"
            data-testid="button-export-docx"
          >
            <Download className="h-4 w-4" />
            {exporting && exportType === 'docx' ? 'Generating...' : 'Export Word'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="manual" className="gap-2" data-testid="tab-manual">
            <BookOpen className="h-4 w-4" />
            User Manual
          </TabsTrigger>
          <TabsTrigger value="workflows" className="gap-2" data-testid="tab-workflows">
            <Workflow className="h-4 w-4" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="quickref" className="gap-2" data-testid="tab-quickref">
            <List className="h-4 w-4" />
            Quick Reference
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                PACT Workflow Platform User Manual
              </CardTitle>
              <CardDescription>
                Comprehensive guide to using the PACT platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <Accordion type="multiple" className="w-full">
                  {sections.map((section, index) => (
                    <AccordionItem key={index} value={`section-${index}`}>
                      <AccordionTrigger className="text-left" data-testid={`accordion-section-${index}`}>
                        <span className="font-semibold">{section.title}</span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pl-4">
                          {section.content.map((para, pIndex) => (
                            <p key={pIndex} className="text-muted-foreground">{para}</p>
                          ))}
                          
                          {section.subsections && (
                            <div className="space-y-4 mt-4">
                              {section.subsections.map((sub, sIndex) => (
                                <div key={sIndex} className="border-l-2 border-muted pl-4">
                                  <h4 className="font-medium mb-2">{sub.title}</h4>
                                  <ul className="space-y-1">
                                    {sub.content.map((item, iIndex) => (
                                      <li key={iIndex} className="text-sm text-muted-foreground flex items-start gap-2">
                                        <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                                        <span>{item.replace(/^-\s*/, '')}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflows" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5" />
                System Workflow Phases
              </CardTitle>
              <CardDescription>
                Step-by-step workflow from setup to payment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {workflowPhases.map((phase, phaseIndex) => {
                  const PhaseIcon = phase.icon;
                  return (
                    <div key={phaseIndex} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${phase.color} text-white`}>
                          <PhaseIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">Phase {phaseIndex + 1}: {phase.name}</h3>
                          <p className="text-sm text-muted-foreground">{phase.steps.length} steps</p>
                        </div>
                      </div>
                      
                      <div className="grid gap-2 ml-12">
                        {phase.steps.map((step, stepIndex) => (
                          <div 
                            key={stepIndex} 
                            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                            data-testid={`workflow-step-${step.step}`}
                          >
                            <Badge variant="outline" className="shrink-0 font-mono">
                              {step.step}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{step.action}</span>
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                <Badge variant="secondary" className="text-xs">
                                  {step.who}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground truncate">{step.details}</p>
                            </div>
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground/30" />
                          </div>
                        ))}
                      </div>
                      
                      {phaseIndex < workflowPhases.length - 1 && (
                        <div className="flex justify-center py-2">
                          <div className="h-6 w-px bg-border" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quickref" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Role Quick Reference
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { action: 'Create users', roles: 'Admin, ICT' },
                    { action: 'Upload MMP', roles: 'Admin, ICT, FOM' },
                    { action: 'Approve costs', roles: 'Financial Admin, Admin' },
                    { action: 'Assign visits', roles: 'Admin, FOM, Supervisor' },
                    { action: 'Claim sites', roles: 'Data Collector' },
                    { action: 'Manage budgets', roles: 'Financial Admin, Admin' },
                    { action: 'Configure fees', roles: 'Admin' },
                    { action: 'Manage wallets', roles: 'Admin, Super Admin' }
                  ].map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b last:border-0">
                      <span className="text-sm">{item.action}</span>
                      <Badge variant="outline" className="text-xs">{item.roles}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500" />
                  Status Color Guide
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { color: 'bg-green-500', meaning: 'Complete / Online / Success' },
                    { color: 'bg-blue-500', meaning: 'In Progress / Active' },
                    { color: 'bg-yellow-500', meaning: 'Pending / Warning' },
                    { color: 'bg-orange-500', meaning: 'Attention Required' },
                    { color: 'bg-red-500', meaning: 'Overdue / Error / Offline' },
                    { color: 'bg-gray-400', meaning: 'Inactive / Archived' },
                    { color: 'bg-purple-500', meaning: 'Claimed / Reserved' }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center gap-3 py-2 border-b last:border-0">
                      <div className={`h-4 w-4 rounded-full ${item.color}`} />
                      <span className="text-sm">{item.meaning}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Mobile Gestures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { gesture: 'Swipe left/right', action: 'Navigate between items' },
                    { gesture: 'Pull down', action: 'Refresh data' },
                    { gesture: 'Long press', action: 'Access options menu' },
                    { gesture: 'Pinch', action: 'Zoom on maps' },
                    { gesture: 'Double tap', action: 'Quick zoom' }
                  ].map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b last:border-0">
                      <span className="text-sm font-medium">{item.gesture}</span>
                      <span className="text-sm text-muted-foreground">{item.action}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  Common Error Solutions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { error: 'Session Expired', solution: 'Log in again' },
                    { error: 'Permission Denied', solution: 'Contact admin for access' },
                    { error: 'Network Error', solution: 'Check internet connection' },
                    { error: 'Validation Failed', solution: 'Fix highlighted fields' },
                    { error: 'Site Already Claimed', solution: 'Try a different site' },
                    { error: 'Duplicate Site', solution: 'Check existing MMPs' }
                  ].map((item, index) => (
                    <div key={index} className="py-2 border-b last:border-0">
                      <div className="text-sm font-medium text-destructive">{item.error}</div>
                      <div className="text-sm text-muted-foreground">{item.solution}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Classification Fee Structure
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Classification</th>
                      <th className="text-left py-2 font-medium">Experience</th>
                      <th className="text-left py-2 font-medium">Fee Level</th>
                      <th className="text-left py-2 font-medium">Typical Assignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2"><Badge className="bg-blue-500">A (Senior)</Badge></td>
                      <td className="py-2">2+ years</td>
                      <td className="py-2">Highest</td>
                      <td className="py-2">Complex sites</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2"><Badge className="bg-green-500">B (Standard)</Badge></td>
                      <td className="py-2">1-2 years</td>
                      <td className="py-2">Medium</td>
                      <td className="py-2">Regular sites</td>
                    </tr>
                    <tr>
                      <td className="py-2"><Badge className="bg-yellow-500">C (Junior)</Badge></td>
                      <td className="py-2">&lt;1 year</td>
                      <td className="py-2">Entry</td>
                      <td className="py-2">Training sites</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator className="my-6" />

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div>
          Document Version: 2.1 | Last Updated: December 2025
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleExportPDF} disabled={exporting} data-testid="button-footer-pdf">
            <FileDown className="h-4 w-4 mr-1" />
            PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportDOCX} disabled={exporting} data-testid="button-footer-docx">
            <Download className="h-4 w-4 mr-1" />
            Word
          </Button>
        </div>
      </div>
    </div>
  );
}
