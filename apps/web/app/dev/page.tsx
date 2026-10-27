import { notFound } from "next/navigation";
import { TestDesk } from "./test-desk";

export default function DevelopmentDesk() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <TestDesk />;
}
