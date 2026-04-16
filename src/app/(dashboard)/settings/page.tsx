'use client';

import { Settings, MessageSquare, Tag } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { TagManager } from '@/components/settings/tag-manager';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage your WhatsApp integration, message templates, and tags.
        </p>
      </div>

      <Tabs defaultValue="whatsapp">
        <TabsList className="bg-slate-900 border border-slate-700">
          <TabsTrigger value="whatsapp" className="data-active:bg-slate-800 data-active:text-emerald-400 text-slate-400">
            <Settings className="size-4" />
            WhatsApp Config
          </TabsTrigger>
          <TabsTrigger value="templates" className="data-active:bg-slate-800 data-active:text-emerald-400 text-slate-400">
            <MessageSquare className="size-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="tags" className="data-active:bg-slate-800 data-active:text-emerald-400 text-slate-400">
            <Tag className="size-4" />
            Tags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp">
          <WhatsAppConfig />
        </TabsContent>

        <TabsContent value="templates">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="tags">
          <TagManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
