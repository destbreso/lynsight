'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { CategoryBucket } from '@lynsight/core';

export default function CategoryChart({ buckets }: { buckets: CategoryBucket[] }) {
  const data = buckets.slice(0, 8).map((b) => ({
    name: b.label,
    value: b.total,
    color: b.color,
  }));
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No findings to chart.</p>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={40}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
