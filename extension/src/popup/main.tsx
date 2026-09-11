import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";
import "./Popup.css";

const root = document.getElementById("root")!;
createRoot(root).render(
  <Popup tabCount={0} sessions={[]} onTidyUp={() => {}} onRestore={() => {}} onDelete={() => {}} />
);
