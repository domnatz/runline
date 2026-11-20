import Link from "next/link";

export function DatePicker({ date, today, path }: { date: string; today: string; path: string }) {
  return (
    <form method="get" action={path} className="flex max-w-full flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="schedule-date">Service date</label>
      <input key={date} type="date" id="schedule-date" name="date" required defaultValue={date} className="rl-control w-40" />
      <button type="submit" className="rl-button min-h-11">View</button>
      {date !== today && <Link href={path} className="px-2 text-sm font-semibold text-neutral-900">Today</Link>}
    </form>
  );
}
