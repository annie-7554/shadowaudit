import type { ParsedVulnerability } from './types';

interface WebhookPayload {
  event: 'new_vulnerabilities';
  target: string;
  timestamp: string;
  count: number;
  vulnerabilities: Array<{
    cveId: string;
    severity: string;
    packageName: string;
    fixedVersion: string;
    title: string;
  }>;
}

const MAX_RETRIES = 3;

export class WebhookSender {
  private readonly webhookUrl: string;

  constructor() {
    const url = process.env.WEBHOOK_URL;
    if (!url) throw new Error('WEBHOOK_URL environment variable is not set');
    this.webhookUrl = url;
  }

  async send(targetId: string, newVulns: ParsedVulnerability[]): Promise<void> {
    const payload: WebhookPayload = {
      event: 'new_vulnerabilities',
      target: targetId,
      timestamp: new Date().toISOString(),
      count: newVulns.length,
      vulnerabilities: newVulns.map((v) => ({
        cveId: v.cveId,
        severity: v.severity,
        packageName: v.packageName,
        fixedVersion: v.fixedVersion,
        title: v.title,
      })),
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Webhook responded with HTTP ${response.status}`);
        }

        console.log(
          `[WebhookSender] Sent ${newVulns.length} new vulns for target ${targetId}`,
        );
        return;
      } catch (err: unknown) {
        const error = err as Error;
        if (attempt === MAX_RETRIES) {
          console.error(
            `[WebhookSender] All ${MAX_RETRIES} attempts failed for target ${targetId}: ${error.message}`,
          );
          throw error;
        }

        const delayMs = Math.pow(2, attempt) * 1000; // exponential backoff: 2s, 4s, 8s
        console.warn(
          `[WebhookSender] Attempt ${attempt} failed, retrying in ${delayMs}ms: ${error.message}`,
        );
        await WebhookSender.delay(delayMs);
      }
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
