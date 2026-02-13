import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>RTCP Collaboration</h1>
      <p>Use a shared document room to collaborate in real-time.</p>
      <Link href="/doc/demo">Open demo document</Link>
    </main>
  );
}
