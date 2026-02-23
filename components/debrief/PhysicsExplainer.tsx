"use client";

import { useMemo } from "react";
import { getTopics } from "@/engine/analysis/educationalTopics";
import type { TopicContent, TopicContext } from "@/engine/analysis/educationalTopics";
import type { FlightResult } from "@/types/physics";
import type { Mission } from "@/types/mission";
import type { ScoreBreakdown } from "@/types/scoring";

interface PhysicsExplainerProps {
  topicIds: string[];
  flight: FlightResult;
  mission: Mission;
  score: ScoreBreakdown;
}

export default function PhysicsExplainer({
  topicIds,
  flight,
  mission,
  score,
}: PhysicsExplainerProps) {
  const context: TopicContext = useMemo(
    () => ({ flight, mission, score }),
    [flight, mission, score]
  );

  const topics = useMemo(() => getTopics(topicIds).slice(0, 3), [topicIds]);

  if (topics.length === 0) return null;

  return (
    <div className="panel mb-6">
      <div className="panel-header">Mission Science</div>
      <div className="p-4 space-y-4">
        {topics.map((topic, i) => (
          <TopicCard
            key={topic.id}
            topic={topic}
            context={context}
            showSeparator={i < topics.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function TopicCard({
  topic,
  context,
  showSeparator,
}: {
  topic: TopicContent;
  context: TopicContext;
  showSeparator: boolean;
}) {
  let personalDetail: string | null = null;
  if (topic.dynamicDetail) {
    try {
      personalDetail = topic.dynamicDetail(context);
    } catch {
      personalDetail = null;
    }
  }

  return (
    <div className="space-y-2">
      <span className="font-mono text-[0.75rem] tracking-wider uppercase text-[var(--nasa-blue-light)] font-bold block">
        {topic.title}
      </span>

      {topic.equation && (
        <div className="px-3 py-1.5 rounded-sm bg-black/30 border border-[var(--border)] inline-block">
          <code className="font-mono text-[0.75rem] text-[var(--data)]">
            {topic.equation}
          </code>
        </div>
      )}

      <p className="font-mono text-[0.65rem] text-[var(--muted)] leading-relaxed">
        {topic.description}
      </p>

      {personalDetail && (
        <p className="font-mono text-[0.65rem] text-[var(--nasa-green)] leading-relaxed italic">
          {personalDetail}
        </p>
      )}

      {showSeparator && <div className="h-px bg-[var(--border)] mt-2" />}
    </div>
  );
}
