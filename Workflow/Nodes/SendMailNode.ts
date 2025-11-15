/*
 * yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 *
 * Copyright (C) 2025 yaLLMa3
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://www.mozilla.org/MPL/2.0/.
 *
 * This software is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied.
 */

import type {
  BaseNode,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
  Position,
  DataType,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface SendMailNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Communication",
  title: "Send Email",
  nodeType: "SendMail",
  nodeValue: "Email Sender",
  sockets: [
    { title: "Email Title", type: "input", dataType: "string" },
    { title: "Email Body", type: "input", dataType: "string" },
    { title: "To Email", type: "input", dataType: "string" },
    { title: "Success", type: "output", dataType: "string" },
    { title: "Status", type: "output", dataType: "string" },
  ],
  width: 320,
  height: 240,
  configParameters: [
    {
      parameterName: "SMTP Host",
      parameterType: "string",
      defaultValue: "smtp.gmail.com",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "SMTP server hostname",
      isNodeBodyContent: false,
    },
    {
      parameterName: "SMTP Port",
      parameterType: "number",
      defaultValue: 587,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "SMTP server port (587 for TLS, 465 for SSL)",
      isNodeBodyContent: false,
    },
    {
      parameterName: "From Email",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Sender email address",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Email Password",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Email password or app-specific password",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Use TLS",
      parameterType: "boolean",
      defaultValue: true,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Enable TLS encryption",
      isNodeBodyContent: false,
    },
  ],
};

export function createSendMailNode(
  id: number,
  position: Position
): SendMailNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: metadata.sockets.map((socket, index) => ({
      id: id * 100 + index + 1,
      title: socket.title,
      type: socket.type,
      nodeId: id,
      dataType: socket.dataType as DataType,
    })),
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    configParameters: [...metadata.configParameters],

    process: async (context: NodeExecutionContext) => {
      try {
        // Get input values
        const emailTitle = await context.inputs[id * 100 + 1];
        const emailBody = await context.inputs[id * 100 + 2];
        const toEmail = await context.inputs[id * 100 + 3];

        console.log(`Executing SendMail node ${id}`);

        // Validate required inputs
        if (!emailTitle || typeof emailTitle !== 'string') {
          throw new Error("Email title is required and must be a string");
        }
        if (!emailBody || typeof emailBody !== 'string') {
          throw new Error("Email body is required and must be a string");
        }
        if (!toEmail || typeof toEmail !== 'string') {
          throw new Error("Recipient email address is required and must be a string");
        }

        // Get configuration parameters
        const getConfigValue = (paramName: string) => {
          const param = context.node.configParameters?.find(
            (p: ConfigParameterType) => p.parameterName === paramName
          );
          return param?.paramValue ?? param?.defaultValue;
        };

        const smtpHost = getConfigValue("SMTP Host") as string;
        const smtpPort = getConfigValue("SMTP Port") as number;
        const fromEmail = getConfigValue("From Email") as string;
        const emailPassword = getConfigValue("Email Password") as string;
        const useTLS = getConfigValue("Use TLS") as boolean;

        // Validate configuration
        if (!fromEmail) {
          throw new Error("From email address must be configured");
        }
        if (!emailPassword) {
          throw new Error("Email password must be configured");
        }

        console.log(`Sending email from ${fromEmail} to ${toEmail}`);
        console.log(`Subject: ${emailTitle}`);

        // Create email message
        const message = {
          from: fromEmail,
          to: toEmail,
          subject: emailTitle,
          text: emailBody,
          html: emailBody.includes("<") ? emailBody : undefined, // Auto-detect HTML
        };

        // Send email using nodemailer
        const emailResult = await sendEmail(
          {
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465, // true for 465, false for other ports
            auth: {
              user: fromEmail,
              pass: emailPassword,
            },
            tls: useTLS ? { rejectUnauthorized: false } : undefined,
          },
          message
        );

        console.log(`Email sent with message ID: ${emailResult.messageId}`);

        console.log(`Email sent successfully to ${toEmail}`);

        return {
          // Socket id 4 is for Success output
          [id * 100 + 4]: `Email sent successfully to ${toEmail}`,
          // Socket id 5 is for Status
          [id * 100 + 5]: `Success: Email "${emailTitle}" sent to ${toEmail}`,
        };
      } catch (error) {
        console.error("Error in SendMail node:", error);

        return {
          [id * 100 + 4]: "",
          [id * 100 + 5]: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },

    getConfigParameters(): ConfigParameterType[] {
      return this.configParameters || [];
    },

    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
    },

    setConfigParameter(
      parameterName: string,
      value: string | number | boolean
    ): void {
      const parameter = (this.configParameters ?? []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    },
  };
}

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  tls?: { rejectUnauthorized: boolean };
}

interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Real email sending function using nodemailer
async function sendEmail(config: EmailConfig, message: EmailMessage) {
  const transporter: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // true for 465, false for other ports
    auth: {
      user: config.auth.user,
      pass: config.auth.pass,
    },
    tls: config.tls, // optional
  });

  try {
    // Verify SMTP connection
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully");

    // Send the email
    const info = await transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    console.log("📨 Email sent successfully:", info.messageId);
    return { messageId: info.messageId };
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    throw new Error(
      `Email sending failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(
    metadata.nodeType,
    createSendMailNode,
    metadata
  );
}
