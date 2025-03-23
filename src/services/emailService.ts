import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true", // true si se usa el puerto 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendResetPasswordEmail = async (to: string, resetUrl: string) => {
  await transporter.sendMail({
    from: process.env.SMTP_FROM, // remitente configurado en .env
    to,
    subject: "Password Reset",
    text: `Se ha solicitado la recuperación de contraseña.
Utilice el siguiente link para resetear su contraseña: ${resetUrl}
Si no solicitó este cambio, por favor ignore este mensaje.`,
  });
};
