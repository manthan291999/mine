import { Editor } from "../../../components/editor";

export default function DocPage({ params }: { params: { id: string } }) {
  return <Editor docId={params.id} />;
}
