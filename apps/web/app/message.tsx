import Link from "next/link";

/** Full-screen status message with a way back to the start page. */
export function Message({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-2xl font-bold">{title}</p>
      {body && <p className="text-foreground/60">{body}</p>}
      {action}
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to start
      </Link>
    </div>
  );
}
