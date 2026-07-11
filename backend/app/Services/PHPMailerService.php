<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

class PHPMailerService
{
    protected PHPMailer $mailer;

    public function __construct()
    {
        $this->mailer = new PHPMailer(true);
        $this->configureMailer();
    }

    public function sendWelcomeEmail(string $toEmail, string $toName, string $password): bool
    {
        try {
            $this->resetMessageState();
            $this->mailer->addAddress($toEmail, $toName);

            $this->mailer->isHTML(true);
            $this->mailer->Subject = 'Welcome to Fish Port Management System';
            $this->mailer->Body = $this->welcomeTemplate($toName, $toEmail, $password);
            $this->mailer->AltBody = "Hello {$toName}, your account has been created.\nEmail: {$toEmail}\nPassword: {$password}";

            $this->mailer->send();

            return true;
        } catch (Exception $e) {
            Log::error('PHPMailer Error: ' . $this->mailer->ErrorInfo, [
                'recipient' => $toEmail,
                'exception' => $e->getMessage(),
            ]);

            return false;
        }
    }

    public function sendPasswordChangeCodeEmail(string $toEmail, string $toName, string $code): bool
    {
        try {
            $this->resetMessageState();
            $this->mailer->addAddress($toEmail, $toName);

            $this->mailer->isHTML(true);
            $this->mailer->Subject = 'Your Fish Port password verification code';
            $this->mailer->Body = $this->passwordChangeCodeTemplate($toName, $code);
            $this->mailer->AltBody = "Hello {$toName}, your password verification code is {$code}. This code expires in 5 minutes.";

            $this->mailer->send();

            return true;
        } catch (Exception $e) {
            Log::error('PHPMailer Error: ' . $this->mailer->ErrorInfo, [
                'recipient' => $toEmail,
                'exception' => $e->getMessage(),
            ]);

            return false;
        }
    }

    private function configureMailer(): void
    {
        $host = config('mail.mailers.smtp.host');
        $port = (int) config('mail.mailers.smtp.port', 587);
        $username = config('mail.mailers.smtp.username');
        $password = config('mail.mailers.smtp.password');
        $encryption = config('mail.mailers.smtp.encryption', env('MAIL_ENCRYPTION', 'tls'));
        $fromAddress = config('mail.from.address');
        $fromName = config('mail.from.name');

        $this->mailer->isSMTP();
        $this->mailer->Host = $host;
        $this->mailer->Port = $port;
        $this->mailer->SMTPAuth = !empty($username);
        $this->mailer->Username = $username;
        $this->mailer->Password = $password;
        $this->mailer->CharSet = PHPMailer::CHARSET_UTF8;
        $this->mailer->Encoding = PHPMailer::ENCODING_BASE64;
        $this->mailer->Timeout = 30;

        if ($encryption === 'ssl') {
            $this->mailer->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($encryption === 'tls') {
            $this->mailer->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        } else {
            $this->mailer->SMTPSecure = false;
            $this->mailer->SMTPAutoTLS = false;
        }

        if (!empty($fromAddress)) {
            $this->mailer->setFrom($fromAddress, $fromName ?? '');
        }
    }

    private function resetMessageState(): void
    {
        $this->mailer->clearAllRecipients();
        $this->mailer->clearReplyTos();
        $this->mailer->clearAttachments();
        $this->mailer->clearCustomHeaders();
    }

    private function welcomeTemplate(string $name, string $email, string $password): string
    {
        return "
        <html>
        <body style='margin:0; padding:32px 16px; background:#f3f6fb; font-family: Montserrat, Arial, sans-serif; color:#0f172a;'>
            <div style='max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #dbe3ef; border-radius:24px; overflow:hidden; box-shadow:0 18px 50px rgba(15,23,42,0.08);'>
                <div style='background:linear-gradient(180deg, #1a1f36 0%, #24325f 100%); padding:28px 32px 24px; text-align:center;'>
                    <p style='margin:0 0 6px; color:#ffffff; font-size:24px; font-weight:700; line-height:1.2; font-family: Montserrat, Arial, sans-serif;'>Welcome to Fish Port Management System</p>
                    <p style='margin:0; color:rgba(255,255,255,0.78); font-size:13px; line-height:1.6; font-family: Montserrat, Arial, sans-serif;'>Your account is ready. Below are the credentials prepared for your first login.</p>
                </div>
                <div style='padding:32px;'>
                    <p style='margin:0 0 14px; font-size:14px; line-height:1.7; color:#334155; font-family: Montserrat, Arial, sans-serif;'>Hello <strong style='color:#0f172a; font-family: Montserrat, Arial, sans-serif;'>{$email}</strong>,</p>
                    <p style='margin:0 0 22px; font-size:14px; line-height:1.7; color:#475569; font-family: Montserrat, Arial, sans-serif;'>Head of MEEO has created your access to the Fish Port Management System. Please use the credentials below to sign in.</p>

                    <div style='border:1px solid #dbe3ef; border-radius:18px; overflow:hidden; background:#f8fafc;'>
                        <div style='padding:14px 18px; border-bottom:1px solid #dbe3ef; background:#eef4ff; color:#1e3a8a; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; font-family: Montserrat, Arial, sans-serif;'>Login Credentials</div>
                        <table style='width:100%; border-collapse:collapse;'>
                            <tr>
                                <td style='width:170px; padding:16px 18px; border-bottom:1px solid #dbe3ef; font-size:12px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#64748b; font-family: Montserrat, Arial, sans-serif;'>Email</td>
                                <td style='padding:16px 18px; border-bottom:1px solid #dbe3ef; font-size:14px; font-weight:600; color:#0f172a; font-family: Montserrat, Arial, sans-serif;'>{$email}</td>
                            </tr>
                            <tr>
                                <td style='padding:16px 18px; font-size:12px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#64748b; font-family: Montserrat, Arial, sans-serif;'>Password</td>
                                <td style='padding:16px 18px; font-size:14px; font-weight:600; color:#0f172a; font-family: Montserrat, Arial, sans-serif;'>{$password}</td>
                            </tr>
                        </table>
                    </div>

                    <div style='margin-top:20px; padding:16px 18px; border-radius:12px; background:#ffffff; border:1px solid #fecaca;'>
                        <p style='margin:0; color:#dc2626; font-size:13px; line-height:1.7; font-weight:600; font-family: Montserrat, Arial, sans-serif;'>
                            Please change your password after your first login to keep your account secure.
                        </p>
                        <p style='margin:10px 0 0; color:#dc2626; font-size:13px; line-height:1.7; font-weight:600; font-family: Montserrat, Arial, sans-serif;'>
                            Do not share your email and password with anyone else. Keep your login information private at all times.
                        </p>
                    </div>
                </div>
            </div>
        </body>
        </html>";
    }

    private function passwordChangeCodeTemplate(string $name, string $code): string
    {
        $displayName = trim($name) !== '' ? $name : 'User';

        return "
        <html>
        <body style='margin:0; padding:32px 16px; background:#f3f6fb; font-family: Montserrat, Arial, sans-serif; color:#0f172a;'>
            <div style='max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #dbe3ef; border-radius:24px; overflow:hidden; box-shadow:0 18px 50px rgba(15,23,42,0.08);'>
                <div style='background:linear-gradient(180deg, #1a1f36 0%, #24325f 100%); padding:28px 32px 24px; text-align:center;'>
                    <p style='margin:0 0 6px; color:#ffffff; font-size:24px; font-weight:700; line-height:1.2; font-family: Montserrat, Arial, sans-serif;'>Password Change Verification</p>
                    <p style='margin:0; color:rgba(255,255,255,0.78); font-size:13px; line-height:1.6; font-family: Montserrat, Arial, sans-serif;'>Use the verification code below to confirm your password update.</p>
                </div>
                <div style='padding:32px;'>
                    <p style='margin:0 0 14px; font-size:14px; line-height:1.7; color:#334155; font-family: Montserrat, Arial, sans-serif;'>Hello <strong style='color:#0f172a; font-family: Montserrat, Arial, sans-serif;'>{$displayName}</strong>,</p>
                    <p style='margin:0 0 22px; font-size:14px; line-height:1.7; color:#475569; font-family: Montserrat, Arial, sans-serif;'>We received a request to change your Fish Port Management System password. Enter this 6-digit code in the verification modal to continue.</p>

                    <div style='margin:0 auto 22px; max-width:280px; padding:18px 24px; border-radius:18px; border:1px solid #dbe3ef; background:#f8fafc; text-align:center;'>
                        <p style='margin:0 0 8px; color:#64748b; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; font-family: Montserrat, Arial, sans-serif;'>Verification Code</p>
                        <p style='margin:0; color:#1a1f36; font-size:32px; font-weight:800; letter-spacing:0.35em; text-indent:0.35em; font-family: Montserrat, Arial, sans-serif;'>{$code}</p>
                    </div>

                    <div style='padding:16px 18px; border-radius:12px; background:#fff7ed; border:1px solid #fed7aa;'>
                        <p style='margin:0; color:#c2410c; font-size:13px; line-height:1.7; font-weight:600; font-family: Montserrat, Arial, sans-serif;'>
                            This code expires in 5 minutes. If you did not request this change, you can ignore this email and keep your current password.
                        </p>
                    </div>
                </div>
            </div>
        </body>
        </html>";
    }
}
