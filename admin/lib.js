export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function bucketDate(isoDate, granularity) {
  const d = new Date(isoDate);
  if (granularity === 'weekly') {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildTimeline(events, granularity = 'monthly') {
  const buckets = new Map();
  for (const event of events) {
    const key = bucketDate(event.createdAt, granularity);
    if (!buckets.has(key)) {
      buckets.set(key, { date: key, shares: 0, albums: 0, sessions: 0, conductors: 0 });
    }
    buckets.get(key)[event.type + 's']++;
  }
  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}
