import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

logger = logging.getLogger(__name__)

class EmailNotificationService:
    """Optional SMTP notification dispatcher. Safe fallback if email credentials are unconfigured."""

    def __init__(self):
        self.enabled = settings.ENABLE_EMAIL_ALERTS
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.user = settings.SMTP_USER
        self.password = settings.SMTP_PASSWORD
        self.recipient = settings.ALERT_EMAIL_RECIPIENT

    def send_alert_notification(self, subject: str, message: str) -> bool:
        """Send security notification email if configured."""
        if not self.enabled or not self.recipient or not self.user:
            logger.debug(f"Email alerts disabled or unconfigured. Suppressing: {subject}")
            return False

        try:
            msg = MIMEMultipart()
            msg["From"] = self.user
            msg["To"] = self.recipient
            msg["Subject"] = f"[The WebCam Security Alert] {subject}"

            body = f"""
The WebCam Intelligent Surveillance Alert Notification
------------------------------------------------------
Alert: {subject}
Details: {message}

Please log in to The WebCam Surveillance Console to review evidence and acknowledge this incident.
            """
            msg.attach(MIMEText(body, "plain"))

            with smtplib.SMTP(self.host, self.port, timeout=5) as server:
                server.starttls()
                server.login(self.user, self.password)
                server.send_message(msg)

            logger.info(f"Email alert sent successfully to {self.recipient}")
            return True
        except Exception as e:
            logger.warning(f"Failed to send email alert: {e}")
            return False

email_service = EmailNotificationService()
