import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import {
  getAllTemplates,
  getActiveTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  PricingTemplate,
} from '@/lib/pricing-templates';

// GET /api/admin/pricing-templates - Get all templates or filter by type
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') as 'vm' | 'container' | null;
    const activeOnly = searchParams.get('active') === 'true';
    
    let templates: PricingTemplate[];
    
    if (activeOnly) {
      templates = await getActiveTemplates(type || undefined);
    } else {
      templates = await getAllTemplates();
      if (type) {
        templates = templates.filter(t => t.type === type);
      }
    }
    
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching pricing templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

// POST /api/admin/pricing-templates - Create new template (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    
    const { type, name, description, billingType, tokenCost, specs, active, featured } = body;
    
    if (!type || !name || !billingType || tokenCost === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const template = await createTemplate({
      type,
      name,
      description: description || '',
      billingType,
      tokenCost,
      specs: specs || {},
      active: active !== false,
      featured: featured || false,
    });
    
    return NextResponse.json(template);
  } catch (error) {
    console.error('Error creating pricing template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}

// PATCH /api/admin/pricing-templates - Update template (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { id, ...updates } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
    }
    
    const template = await updateTemplate(id, updates);
    
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    
    return NextResponse.json(template);
  } catch (error) {
    console.error('Error updating pricing template:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

// DELETE /api/admin/pricing-templates - Delete template (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
    }
    
    const deleted = await deleteTemplate(id);
    
    if (!deleted) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting pricing template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
