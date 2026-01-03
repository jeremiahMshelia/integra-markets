"""
Email Service for Integra Markets
Supports multiple email providers: Resend (primary), Zoho Mail (fallback)
"""
import smtplib
import httpx
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List, Dict, Any

from core.config import settings

logger = logging.getLogger(__name__)

# Resend API URL
RESEND_API_URL = "https://api.resend.com/emails"


def get_alert_email_html(
    user_name: str,
    commodity: str,
    sentiment: str,
    headline: str,
    summary: str,
    source: str,
    confidence: float = None
) -> str:
    """Generate HTML email for market alert"""
    
    sentiment_color = {
        'BULLISH': '#4ECCA3',
        'BEARISH': '#FF6B6B',
        'NEUTRAL': '#A0A0A0'
    }.get(sentiment.upper(), '#A0A0A0')
    
    confidence_text = f"Confidence: {int(confidence * 100)}%" if confidence else ""
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Integra Markets Alert</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #121212; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <tr>
                <td style="padding: 20px; background-color: #1E1E1E; border-radius: 12px; border: 1px solid #333333;">
                    <!-- Header -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="padding-bottom: 20px; border-bottom: 1px solid #333333;">
                                <h1 style="margin: 0; color: #4ECCA3; font-size: 24px; font-weight: 600;">
                                    Integra Markets
                                </h1>
                                <p style="margin: 5px 0 0 0; color: #A0A0A0; font-size: 14px;">
                                    Market Intelligence Alert
                                </p>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Alert Badge -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                        <tr>
                            <td>
                                <span style="display: inline-block; padding: 6px 12px; background-color: #30A5FF; color: #121212; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                                    {commodity}
                                </span>
                                <span style="display: inline-block; padding: 6px 12px; background-color: {sentiment_color}; color: #121212; border-radius: 20px; font-size: 12px; font-weight: 600; margin-left: 8px;">
                                    {sentiment}
                                </span>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Headline -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                        <tr>
                            <td>
                                <h2 style="margin: 0; color: #ECECEC; font-size: 20px; font-weight: 600; line-height: 1.4;">
                                    {headline}
                                </h2>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Summary -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 15px;">
                        <tr>
                            <td>
                                <p style="margin: 0; color: #A0A0A0; font-size: 16px; line-height: 1.6;">
                                    {summary}
                                </p>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Meta Info -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #333333;">
                        <tr>
                            <td>
                                <p style="margin: 0; color: #A0A0A0; font-size: 14px;">
                                    <strong style="color: #ECECEC;">Source:</strong> {source}
                                </p>
                                {f'<p style="margin: 5px 0 0 0; color: #A0A0A0; font-size: 14px;">{confidence_text}</p>' if confidence_text else ''}
                            </td>
                        </tr>
                    </table>
                    
                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 25px;">
                        <tr>
                            <td align="center">
                                <a href="https://integra-markets.com" style="display: inline-block; padding: 14px 28px; background-color: #4ECCA3; color: #121212; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                    View in App
                                </a>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Footer -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #333333;">
                        <tr>
                            <td align="center">
                                <p style="margin: 0; color: #666666; font-size: 12px;">
                                    You're receiving this because you enabled email alerts in Integra Markets.
                                </p>
                                <p style="margin: 10px 0 0 0; color: #666666; font-size: 12px;">
                                    <a href="https://integra-markets.com/settings" style="color: #A0A0A0; text-decoration: underline;">Manage preferences</a>
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """


async def send_email_via_resend(
    to_email: str,
    subject: str,
    html_content: str,
    from_email: str = "alerts@integra-markets.com"
) -> Dict[str, Any]:
    """Send email via Resend API"""
    resend_api_key = getattr(settings, 'RESEND_API_KEY', None)
    
    if not resend_api_key:
        return {"success": False, "error": "Resend API key not configured"}
    
    payload = {
        "from": f"Integra Markets <{from_email}>",
        "to": [to_email],
        "subject": subject,
        "html": html_content
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                RESEND_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"Email sent via Resend to {to_email}")
                return {"success": True, "message_id": result.get('id')}
            else:
                logger.error(f"Resend error: {response.text}")
                return {"success": False, "error": response.text}
                
    except Exception as e:
        logger.error(f"Resend error: {str(e)}")
        return {"success": False, "error": str(e)}


def send_email_via_zoho(
    to_email: str,
    subject: str,
    html_content: str
) -> Dict[str, Any]:
    """Send email via Zoho Mail SMTP"""
    smtp_host = settings.ZOHO_MAIL_SMTP_HOST
    smtp_port = settings.ZOHO_MAIL_SMTP_PORT
    from_email = settings.ZOHO_MAIL_FROM_EMAIL
    app_password = settings.ZOHO_MAIL_APP_PASSWORD
    from_name = settings.ZOHO_MAIL_FROM_NAME
    
    if not from_email or not app_password:
        return {"success": False, "error": "Zoho Mail not configured"}
    
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f"{from_name} <{from_email}>"
    msg['To'] = to_email
    
    html_part = MIMEText(html_content, 'html')
    msg.attach(html_part)
    
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(from_email, app_password)
            server.sendmail(from_email, to_email, msg.as_string())
        
        logger.info(f"Email sent via Zoho to {to_email}")
        return {"success": True}
                
    except Exception as e:
        logger.error(f"Zoho error: {str(e)}")
        return {"success": False, "error": str(e)}


async def send_email_alert(
    to_email: str,
    user_name: str,
    commodity: str,
    sentiment: str,
    headline: str,
    summary: str,
    source: str,
    confidence: float = None
) -> Dict[str, Any]:
    """
    Send a market alert email to a user.
    Tries Resend first, falls back to Zoho Mail.
    
    Args:
        to_email: Recipient email address
        user_name: User's display name
        commodity: Commodity name (e.g., "Crude Oil")
        sentiment: Market sentiment ("BULLISH", "BEARISH", "NEUTRAL")
        headline: Alert headline
        summary: Alert summary/analysis
        source: News source
        confidence: Optional confidence score (0-1)
    
    Returns:
        Dict with send status
    """
    html_content = get_alert_email_html(
        user_name=user_name,
        commodity=commodity,
        sentiment=sentiment,
        headline=headline,
        summary=summary,
        source=source,
        confidence=confidence
    )
    
    subject = f"🔔 {commodity} Alert: {sentiment} - {headline[:50]}..."
    
    # Try Resend first (recommended for testing)
    resend_key = getattr(settings, 'RESEND_API_KEY', None)
    if resend_key:
        result = await send_email_via_resend(to_email, subject, html_content)
        if result.get('success'):
            return result
    
    # Fallback to Zoho Mail
    zoho_password = getattr(settings, 'ZOHO_MAIL_APP_PASSWORD', None)
    if zoho_password:
        return send_email_via_zoho(to_email, subject, html_content)
    
    logger.warning("No email service configured. Email not sent.")
    return {"success": False, "error": "No email service configured"}


async def send_bulk_email_alerts(
    recipients: List[Dict[str, str]],
    commodity: str,
    sentiment: str,
    headline: str,
    summary: str,
    source: str,
    confidence: float = None
) -> Dict[str, Any]:
    """
    Send alert emails to multiple recipients
    """
    results = {
        "total": len(recipients),
        "success": 0,
        "failed": 0,
        "errors": []
    }
    
    for recipient in recipients:
        result = await send_email_alert(
            to_email=recipient['email'],
            user_name=recipient.get('name', 'Trader'),
            commodity=commodity,
            sentiment=sentiment,
            headline=headline,
            summary=summary,
            source=source,
            confidence=confidence
        )
        
        if result.get('success'):
            results['success'] += 1
        else:
            results['failed'] += 1
            results['errors'].append({
                'email': recipient['email'],
                'error': result.get('error')
            })
    
    logger.info(f"Bulk email complete: {results['success']}/{results['total']} sent")
    return results
