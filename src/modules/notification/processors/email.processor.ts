import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import { MailService } from "../../../core/mail.service";
import { EmailTemplateService } from "../email-template.service";
import { EMAIL_QUEUE, type EmailJob } from "../notification.types";

/** Renders queued emails from their EJS templates and sends them through Brevo. */
// Brevo's free plan allows a modest send rate; the limiter keeps bursts under it
@Processor(EMAIL_QUEUE, { concurrency: 5, limiter: { max: 10, duration: 1000 } })
export class EmailProcessor extends WorkerHost {
    private readonly logger = new Logger(EmailProcessor.name);

    constructor(
        private readonly templates: EmailTemplateService,
        private readonly mail: MailService,
    ) {
        super();
    }

    async process(job: Job<EmailJob>): Promise<void> {
        // Retrying can't fix missing configuration
        if (!this.mail.isConfigured) {
            throw new UnrecoverableError("Brevo is not configured (BREVO_API_KEY, BREVO_SENDER_EMAIL)");
        }
        const { to, template, data } = job.data;
        const email = await this.templates.render(template, data);
        await this.mail.send({ to, ...email });
    }

    @OnWorkerEvent("failed")
    onFailed(job: Job<EmailJob> | undefined, error: Error): void {
        if (!job) return;
        const final = job.attemptsMade >= (job.opts.attempts ?? 1) || error instanceof UnrecoverableError;
        this.logger.error(
            `"${job.data.template}" email (job ${job.id}) failed on attempt ${job.attemptsMade}${final ? ", giving up" : ""}: ${error.message}`,
        );
    }
}
