import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { errorMessage } from "../common/errors";
import { config } from "../config/env";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

export interface MailMessage {
    to: string;
    subject: string;
    html: string;
    text: string;
}

/** Transactional email through Brevo's HTTP API. Called by the email queue worker, not directly. */
@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);

    readonly isConfigured = Boolean(config.brevo.apiKey && config.brevo.senderEmail);

    /** Throws a 5xx if the email couldn't be handed to Brevo. */
    async send(message: MailMessage): Promise<void> {
        if (!this.isConfigured) {
            throw new HttpException("Email is not configured on the server", HttpStatus.SERVICE_UNAVAILABLE);
        }
        let res: Response;
        try {
            res = await fetch(BREVO_SEND_URL, {
                method: "POST",
                headers: {
                    "api-key": config.brevo.apiKey,
                    "content-type": "application/json",
                    accept: "application/json",
                },
                body: JSON.stringify({
                    sender: { email: config.brevo.senderEmail, name: config.brevo.senderName },
                    to: [{ email: message.to }],
                    subject: message.subject,
                    htmlContent: message.html,
                    textContent: message.text,
                }),
                signal: AbortSignal.timeout(10_000),
            });
        } catch (error) {
            this.logger.error(`Brevo request failed: ${errorMessage(error)}`);
            throw new HttpException("Failed to send the email. Please try again.", HttpStatus.BAD_GATEWAY);
        }
        if (!res.ok) {
            this.logger.error(`Brevo rejected the email (${res.status}): ${await res.text().catch(() => "")}`);
            throw new HttpException("Failed to send the email. Please try again.", HttpStatus.BAD_GATEWAY);
        }
    }
}
