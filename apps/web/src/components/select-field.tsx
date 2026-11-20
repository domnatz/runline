"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";

type Option = { value: string; label: string; detail?: string };

export function SelectField({ id, name, options, defaultValue, placeholder, required, disabled }: {
  id: string;
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [invalid, setInvalid] = useState(false);
  const errorId = `${id}-error`;

  return (
    <div className="min-w-0" onInvalid={(event) => {
      event.preventDefault();
      setInvalid(true);
      trigger.current?.focus();
    }}>
      <Select.Root name={name} defaultValue={defaultValue} required={required} disabled={disabled}
        onValueChange={() => setInvalid(false)}>
        <Select.Trigger id={id} ref={trigger} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
          className="rl-control flex items-center justify-between gap-2 text-left font-normal outline-offset-2 data-placeholder:text-neutral-600 disabled:opacity-70">
          <span className="min-w-0 truncate"><Select.Value placeholder={placeholder} /></span>
          <Select.Icon asChild><ChevronDown aria-hidden="true" size={16} className="shrink-0 text-neutral-600" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content position="popper" align="start" sideOffset={4} collisionPadding={12}
            className="z-50 max-h-[var(--radix-select-content-available-height)] w-max max-w-[var(--radix-select-content-available-width)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-neutral-200 bg-white shadow-md">
            <Select.Viewport className="p-1">
              {options.map(({ value, label, detail }) => (
                <Select.Item key={value} value={value} aria-describedby={detail ? `${id}-${value}-detail` : undefined}
                  className="relative flex min-h-10 cursor-default flex-col justify-center rounded-sm py-2 pr-9 pl-3 text-sm text-neutral-900 outline-none data-highlighted:bg-neutral-100">
                  <Select.ItemText>{label}</Select.ItemText>
                  {detail && <span id={`${id}-${value}-detail`} className="max-w-80 text-xs text-neutral-700">{detail}</span>}
                  <Select.ItemIndicator className="absolute top-1/2 right-3 -tranneutral-y-1/2 text-neutral-900">
                    <Check size={16} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {invalid && <p id={errorId} role="alert" className="mt-1 text-sm font-normal text-red-700">Choose an option to continue.</p>}
    </div>
  );
}
