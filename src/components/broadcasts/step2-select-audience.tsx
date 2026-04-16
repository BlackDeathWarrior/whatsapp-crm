'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Tag } from '@/types';
import { Button } from '@/components/ui/button';
import { Users, Tags, Filter, Upload, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';

type AudienceType = 'all' | 'tags' | 'custom_field' | 'csv';

interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  csvContacts?: { phone: string; name?: string }[];
}

interface Step2Props {
  audience: AudienceConfig;
  onUpdate: (audience: AudienceConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

const audienceOptions: { type: AudienceType; label: string; description: string; icon: typeof Users }[] = [
  { type: 'all', label: 'All Contacts', description: 'Send to every contact in your database', icon: Users },
  { type: 'tags', label: 'Filter by Tags', description: 'Target contacts with specific tags', icon: Tags },
  { type: 'custom_field', label: 'Custom Field', description: 'Filter by a custom field value', icon: Filter },
  { type: 'csv', label: 'Upload CSV', description: 'Upload a list of phone numbers', icon: Upload },
];

export function Step2SelectAudience({ audience, onUpdate, onNext, onBack }: Step2Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  useEffect(() => {
    if (audience.type === 'tags') {
      async function fetchTags() {
        setLoadingTags(true);
        try {
          const supabase = createClient();
          const { data } = await supabase.from('tags').select('*').order('name');
          setTags(data ?? []);
        } finally {
          setLoadingTags(false);
        }
      }
      fetchTags();
    }
  }, [audience.type]);

  const fetchEstimatedCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const supabase = createClient();

      if (audience.type === 'all') {
        const { count } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });
        setEstimatedCount(count ?? 0);
      } else if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
        const { data: contactTags } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.tagIds);

        const uniqueIds = new Set((contactTags ?? []).map((ct) => ct.contact_id));
        setEstimatedCount(uniqueIds.size);
      } else if (audience.type === 'csv' && audience.csvContacts) {
        setEstimatedCount(audience.csvContacts.length);
      } else {
        setEstimatedCount(null);
      }
    } finally {
      setLoadingCount(false);
    }
  }, [audience.type, audience.tagIds, audience.csvContacts]);

  useEffect(() => {
    if (audience.type === 'all' || (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) || (audience.type === 'csv' && audience.csvContacts && audience.csvContacts.length > 0)) {
      fetchEstimatedCount();
    } else {
      setEstimatedCount(null);
    }
  }, [audience.type, audience.tagIds, audience.csvContacts, fetchEstimatedCount]);

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, tagIds: updated });
  }

  const isValid =
    audience.type === 'all' ||
    (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) ||
    (audience.type === 'csv' && audience.csvContacts && audience.csvContacts.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Select Audience</h2>
        <p className="mt-1 text-sm text-slate-400">Choose who will receive this broadcast.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {audienceOptions.map((option) => {
          const isSelected = audience.type === option.type;
          const Icon = option.icon;
          return (
            <button
              key={option.type}
              onClick={() => onUpdate({ type: option.type, tagIds: option.type === 'tags' ? audience.tagIds : undefined })}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/30'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  isSelected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{option.label}</p>
                <p className="mt-0.5 text-xs text-slate-400">{option.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {audience.type === 'tags' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="mb-3 text-sm font-medium text-white">Select Tags</p>
          {loadingTags ? (
            <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
          ) : tags.length === 0 ? (
            <p className="text-xs text-slate-400">No tags found. Create tags in Settings.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = audience.tagIds?.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Audience Summary */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p className="mb-2 text-sm font-medium text-white">Audience Summary</p>
        {loadingCount ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            <span className="text-xs text-slate-400">Calculating...</span>
          </div>
        ) : estimatedCount !== null ? (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-400" />
            <span className="text-sm text-white">{estimatedCount.toLocaleString()}</span>
            <span className="text-xs text-slate-400">estimated recipients</span>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Select an audience type to see the estimate.</p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 pt-4">
        <Button variant="outline" onClick={onBack} className="border-slate-700 text-slate-300">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
