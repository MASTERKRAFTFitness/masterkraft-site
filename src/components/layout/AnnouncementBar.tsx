import Link from "next/link";

export default function AnnouncementBar() {
  return (
    <div className="bg-carbon text-white text-center text-sm py-2.5">
      <Link
        href="/equipment/clearance"
        className="font-display uppercase tracking-widest underline underline-offset-4 hover:text-accent transition-colors"
      >
        Clearance Sale On Now
      </Link>
    </div>
  );
}
