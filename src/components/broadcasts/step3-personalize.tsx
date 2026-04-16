'use client';

import { useMemo } from 'react';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Eye } from 'lucide-react';

interface VariableMapping {
  type: 'static' | 'field';
  value: string;
}

interface Step3Props {
  template: MessageTemplate;
  variables: Record<string, VariableMapping>;
  onUpdate: (variables: Record<string, VariableMapping>) => void;
  onNext: () => void;
  onBack: () => void;
}

const contactFields = [
  { value: 'name', label: 'Contact Name' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'email', label: 'Email Address' },
  { value: 'company', label: 'Company' },
];

const sampleContact = {
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  company: 'Acme Corp',
};

export function Step3Personalize({ template, variables, onUpdate, onNext, onBack }: Step3Props) {
  // Extract {{1}}, {{2}}, etc. from body_text
  const placeholders = useMemo(() => {
    const matches = template.body_text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches)].sort();
  }, [template.body_text]);

  function updateVariable(key: string, field: Partial<VariableMapping>) {
    const current = variables[key] ?? { type: 'static', value: '' };
    onUpdate({
      ...variables,
      [key]: { ...current, ...field },
    });
  }

  // Generate preview with sample data
  const previewText = useMemo(() => {
    let text = template.body_text;
    for (const placeholder of placeholders) {
      const key = placeholder;
      const mapping = variables[key];
      let replacement = placeholder;

      if (mapping) {
        if (mapping.type === 'static' && mapping.value) {
          replacement = mapping.value;
        } else if (mapping.type === 'field' && mapping.value) {
          replacement = sampleContact[mapping.value as keyof typeof sampleContact] ?? placeholder;
        }
      }
      text = text.replaceAll(placeholder, replacement);
    }
    return text;
  }, [template.body_text, variables, placeholders]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Personalize Message</h2>
        <p className="mt-1 text-sm text-slate-400">
          Map template variables to contact fields or static values.
        </p>
      </div>

      {placeholders.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-center">
          <p className="text-sm text-slate-400">This template has no variables to personalize.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {placeholders.map((placeholder) => {
            const mapping = variables[placeholder] ?? { type: 'static', value: '' };

            return (
              <div key={placeholder} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-mono font-medium text-emerald-400">
                    {placeholder}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Mapping Type
                    </label>
                    <Select
                      value={mapping.type}
                      onValueChange={(val) =>
                        updateVariable(placeholder, { type: val as 'static' | 'field', value: '' })
                      }
                    >
                      <SelectTrigger className="w-full border-slate-700 bg-slate-800 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-slate-700 bg-slate-800">
                        <SelectItem value="static">Static Value</SelectItem>
                        <SelectItem value="field">Contact Field</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {mapping.type === 'static' ? 'Value' : 'Field'}
                    </label>
                    {mapping.type === 'static' ? (
                      <Input
                        value={mapping.value}
                        onChange={(e) => updateVariable(placeholder, { value: e.target.value })}
                        placeholder="Enter value..."
                        className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
                      />
                    ) : (
                      <Select
                        value={mapping.value || undefined}
                        onValueChange={(val) => updateVariable(placeholder, { value: val || '' })}
                      >
                        <SelectTrigger className="w-full border-slate-700 bg-slate-800 text-white">
                          <SelectValue placeholder="Select field..." />
                        </SelectTrigger>
                        <SelectContent className="border-slate-700 bg-slate-800">
                          {contactFields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-emerald-400" />
          <p className="text-sm font-medium text-white">Preview</p>
          <span className="text-xs text-slate-500">(with sample data)</span>
        </div>
        <div className="rounded-lg bg-slate-800/50 p-3">
          <p className="whitespace-pre-wrap text-sm text-slate-200">{previewText}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 pt-4">
        <Button variant="outline" onClick={onBack} className="border-slate-700 text-slate-300">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
