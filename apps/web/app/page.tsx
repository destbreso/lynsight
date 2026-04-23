import UploadForm from '@/components/upload-form';

export default function HomePage() {
  return (
    <main className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">Lynis audit reporter</h1>
        <p className="max-w-2xl text-slate-500">
          Drop a Lynis audit <code className="rounded bg-slate-200/60 px-1 dark:bg-slate-800">.tar.gz</code>{' '}
          and get a prioritized, color-coded report. Optional LLM enrichment via{' '}
          <strong>Ollama</strong> (local), OpenAI, Anthropic, or any OpenAI-compatible endpoint.
        </p>
      </section>

      <UploadForm />

      <section className="rounded-xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-800">
        <h2 className="mb-2 font-semibold text-slate-700 dark:text-slate-300">How to generate the audit</h2>
        <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-900">
{`# On the target host
sudo lynis audit system --auditor "$(whoami)"

# Lynis writes /var/log/lynis-report.dat and /var/log/lynis.log
# Bundle them:
sudo tar -czf lynis-$(hostname)-$(date +%F).tar.gz \\
    /var/log/lynis-report.dat /var/log/lynis.log`}
        </pre>
      </section>
    </main>
  );
}
