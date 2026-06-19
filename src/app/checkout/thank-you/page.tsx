export const dynamic = "force-dynamic";

export default function ThankYouPage() {
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="card p-10 max-w-md text-center">
        <div className="h-12 w-12 rounded-full bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-4 text-2xl">
          ✓
        </div>
        <h1 className="text-lg font-semibold">Thank you for your order</h1>
        <p className="text-sm text-ink-muted mt-2">
          Your payment is being confirmed. You will receive an order confirmation by email shortly.
        </p>
      </div>
    </div>
  );
}
