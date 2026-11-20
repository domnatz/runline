export function readDestination(latitude: FormDataEntryValue | undefined, longitude: FormDataEntryValue | undefined) {
  if (Boolean(latitude) !== Boolean(longitude)) throw new Error("Enter both destination coordinates.");
  return latitude && longitude ? { latitude: Number(latitude), longitude: Number(longitude) } : undefined;
}

export function DestinationFields({ hint }: { hint: string }) {
  return (
    <details className="py-1 sm:col-span-2">
      <summary className="cursor-pointer text-sm font-medium text-neutral-900">Destination coordinates</summary>
      <p className="mt-2 text-xs text-neutral-600">{hint}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">Latitude
          <input name="latitude" type="number" step="any" min={-90} max={90} className="rl-control min-w-0" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">Longitude
          <input name="longitude" type="number" step="any" min={-180} max={180} className="rl-control min-w-0" />
        </label>
      </div>
    </details>
  );
}
