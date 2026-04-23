# examples/

Drop your Lynis audit bundles here for local testing. Anything in this folder
except this file is gitignored.

To generate one:

```bash
sudo lynis audit system --auditor "$(whoami)"
sudo tar -czf examples/lynis-$(hostname)-$(date +%F).tar.gz \
    /var/log/lynis-report.dat /var/log/lynis.log
```

Then:

```bash
pnpm dev:cli scan examples/lynis-*.tar.gz --out examples/out
```
