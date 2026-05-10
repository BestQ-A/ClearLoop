import { useEffect } from "react";
import HistoryPanel from "../components/HomePage/HistoryPanel";
import { useTraycerApp } from "./TraycerAppContext";

export default function HistoryView() {
  const { history, refreshHistory, sendToExtension } = useTraycerApp();

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  return <HistoryPanel history={history} sendToExtension={sendToExtension} />;
}
