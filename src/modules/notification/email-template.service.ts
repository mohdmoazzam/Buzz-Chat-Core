import { Injectable, type OnModuleInit } from "@nestjs/common";
import { renderFile } from "ejs";
import { existsSync } from "fs";
import { join } from "path";
import { config } from "../../config/env";
import type { EmailTemplate, EmailTemplateData } from "./notification.types";

// Compiled into dist/src/modules/notification, so the backend root is four levels up
const TEMPLATE_DIR = join(__dirname, "../../../../templates/email");
const LAYOUT = join(TEMPLATE_DIR, "layout.ejs");

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

/**
 * Renders templates/email/<name>/{subject,html,text}.ejs. The html part is wrapped in layout.ejs.
 * Every template also gets `app` (name, url, year). Use <%= %> in html (escaped) and <%- %> in text/subject.
 */
@Injectable()
export class EmailTemplateService implements OnModuleInit {
    private readonly app = { name: "BuzzChat", url: config.appUrl, year: new Date().getFullYear() };

    // Fail at startup, not when the first email is sent, if the templates weren't deployed
    onModuleInit(): void {
        if (!existsSync(LAYOUT)) {
            throw new Error(`Email templates not found in ${TEMPLATE_DIR}`);
        }
    }

    async render<T extends EmailTemplate>(template: T, data: EmailTemplateData[T]): Promise<RenderedEmail> {
        const locals = { ...data, app: this.app };
        const part = (name: string) => this.renderFile(join(TEMPLATE_DIR, template, `${name}.ejs`), locals);

        const [subject, content, text] = await Promise.all([part("subject"), part("html"), part("text")]);
        const html = await this.renderFile(LAYOUT, { ...locals, subject: subject.trim(), content });
        return {
            subject: subject.trim(),
            html,
            text: text.trim(),
        };
    }

    private renderFile(path: string, locals: Record<string, unknown>): Promise<string> {
        return renderFile(path, locals, { cache: config.isProduction });
    }
}
