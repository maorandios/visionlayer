"use client";

import { useParams } from "next/navigation";
import { RuleWizard } from "@/components/rules/wizard/RuleWizard";

export default function EditRulePage() {
  const { id } = useParams<{ id: string }>();
  return <RuleWizard mode="edit" ruleId={id} />;
}
