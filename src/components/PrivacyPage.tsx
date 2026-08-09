export function PrivacyPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
        Privacy Policy
      </h1>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        Last updated: August 9, 2026
      </p>

      <p>
        TinyMedia respects your privacy. This Privacy Policy explains what
        information we collect, how we use it, and how we handle files and
        feedback submitted through our service.
      </p>

      <h2 className="pt-2 text-base font-medium text-gray-900 dark:text-gray-50">
        How your files are handled
      </h2>

      <p>
        TinyMedia processes supported media files directly in your browser
        whenever possible. Your original media file does not need to be
        uploaded to our server for browser-based processing.
      </p>

      <p>
        After processing is completed, the resulting file may be uploaded to
        our cloud storage so that the service can provide and maintain the
        processed result. Processed files are retained for up to 30 days and
        are automatically deleted after this retention period.
      </p>

      <p>
        You should not upload confidential, sensitive, or highly personal
        information that you do not want stored temporarily as part of using
        the service.
      </p>

      <h2 className="pt-2 text-base font-medium text-gray-900 dark:text-gray-50">
        Information we collect
      </h2>

      <p>
        Depending on how you use TinyMedia, we may collect limited information
        such as the files or processed results required to provide the service,
        technical information required for security and operation, and
        information that you voluntarily provide through our feedback form.
      </p>

      <h2 className="pt-2 text-base font-medium text-gray-900 dark:text-gray-50">
        Feedback you send
      </h2>

      <p>
        If you submit feedback, we store the message you provide. You may also
        optionally provide your name or email address. This information is used
        to review your feedback and, where you provide contact information, to
        respond to you.
      </p>

      <p>
        We may also temporarily record technical information such as your IP
        address and browser user-agent when submitting feedback. This may be
        used for security, abuse prevention, and rate limiting.
      </p>

      <h2 className="pt-2 text-base font-medium text-gray-900 dark:text-gray-50">
        How we use information
      </h2>

      <p>
        We use collected information to operate, maintain, secure, and improve
        TinyMedia, provide requested functionality, prevent abuse, and respond
        to feedback or support requests.
      </p>

      <h2 className="pt-2 text-base font-medium text-gray-900 dark:text-gray-50">
        Data retention
      </h2>

      <p>
        Processed media stored by TinyMedia is retained for up to 300 days and
        is then deleted. Feedback information may be retained for as long as
        reasonably necessary to review feedback, provide support, maintain
        security, and comply with applicable legal obligations.
      </p>

      <h2 className="pt-2 text-base font-medium text-gray-900 dark:text-gray-50">
        Third-party services
      </h2>

      <p>
        TinyMedia may use third-party infrastructure and service providers to
        host application data and provide cloud storage. These providers
        process information only as necessary to provide the services on which
        TinyMedia relies.
      </p>

      <h2 className="pt-2 text-base font-medium text-gray-900 dark:text-gray-50">
        Security
      </h2>

      <p>
        We take reasonable technical measures to protect information handled
        by TinyMedia. However, no method of transmission or electronic storage
        is completely secure, and we cannot guarantee absolute security.
      </p>

      <h2 className="pt-2 text-base font-medium text-gray-900 dark:text-gray-50">
        Your choices and data requests
      </h2>

      <p>
        If you have questions about information associated with your use of
        TinyMedia or would like to request deletion of information that we
        retain, please contact us using the address below.
      </p>

      <h2 className="pt-2 text-base font-medium text-gray-900 dark:text-gray-50">
        Contact
      </h2>

      <p>
        For privacy questions, data deletion requests, or other privacy
        concerns, contact us at:
      </p>

      <p>
        <a
          href="mailto:privacy@tinymedia.app"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          privacy@tinymedia.app
        </a>
      </p>
    </div>
  );
}