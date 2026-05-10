import McpPanel from "../components/HomePage/McpPanel";
import { useTraycerApp } from "./TraycerAppContext";

export default function McpView() {
  const { sendToExtension } = useTraycerApp();
  return <McpPanel sendToExtension={sendToExtension} />;
}
