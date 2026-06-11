'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Settings,
  MessageSquare,
  Tag,
  User,
  Palette,
  UsersRound,
  Coins,
  SlidersHorizontal,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { TagManager } from '@/components/settings/tag-manager';
import { ProfileForm } from '@/components/settings/profile-form';
import { PasswordForm } from '@/components/settings/password-form';
import { SessionsCard } from '@/components/settings/sessions-card';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { MembersTab } from '@/components/settings/members-tab';
import { DealsSettings } from '@/components/settings/deals-settings';
import { CustomFieldsSettings } from '@/components/settings/custom-fields-settings';

const TAB_VALUES = [
  'profile',
  'whatsapp',
  'templates',
  'tags',
  'custom-fields',
  'deals',
  'appearance',
  'members',
] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string | null): v is TabValue {
  return !!v && (TAB_VALUES as readonly string[]).includes(v);
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Custom-field definitions are account-wide config, so editing them is
  // admin+ only — mirror the gate on the Contacts page. The `custom_fields`
  // RLS rejects non-admin writes regardless.
  const canEditSettings = useCan('edit-settings');

  // The URL is the single source of truth for the active tab — no
  // local state, no sync effect. A previous revision duplicated this
  // into `useState` + a sync effect, which tripped React 19's
  // set-state-in-effect rule and was also redundant.
  const queryTab = searchParams.get('tab');
  // Deep-linking to the admin-only tab as a non-admin falls back to profile
  // rather than landing on a tab with no trigger or content.
  const resolved: TabValue = isTabValue(queryTab) ? queryTab : 'profile';
  const tab: TabValue =
    resolved === 'custom-fields' && !canEditSettings ? 'profile' : resolved;

  const onChange = (next: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage your profile, WhatsApp® integration, message templates, and
          tags.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => onChange(v as TabValue)}>
        <TabsList className="border border-slate-700 bg-slate-900">
          <TabsTrigger
            value="profile"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <User className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="whatsapp"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Settings className="size-4" />
            WhatsApp Config
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <MessageSquare className="size-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger
            value="tags"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Tag className="size-4" />
            Tags
          </TabsTrigger>
          {canEditSettings && (
            <TabsTrigger
              value="custom-fields"
              className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
            >
              <SlidersHorizontal className="size-4" />
              Custom Fields
            </TabsTrigger>
          )}
          <TabsTrigger
            value="deals"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Coins className="size-4" />
            Deals
          </TabsTrigger>
          <TabsTrigger
            value="appearance"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <Palette className="size-4" />
            Appearance
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="data-active:text-primary text-slate-400 data-active:bg-slate-800"
          >
            <UsersRound className="size-4" />
            Members
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileForm />
          <PasswordForm />
          <SessionsCard />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppConfig />
        </TabsContent>

        <TabsContent value="templates">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="tags">
          <TagManager />
        </TabsContent>

        {canEditSettings && (
          <TabsContent value="custom-fields">
            <CustomFieldsSettings />
          </TabsContent>
        )}

        <TabsContent value="deals">
          <DealsSettings />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearancePanel />
        </TabsContent>

        <TabsContent value="members">
          <MembersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
