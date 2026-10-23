import { ArrowLeft } from "lucide-react";
import { ReturnLink } from "./PageNavigation";

export function PracticeReturn() {
  return <ReturnLink className="practice-return practice-hub-return" to="/practice">
    <ArrowLeft className="ui-icon" aria-hidden="true" />返回练习
  </ReturnLink>;
}
