import type { LlmAdapter, WalkThroughInput, AgentTurn } from "./types";
import {
  pickOpening,
  templateClusterQuestion,
  templateSingleQuestion,
  templateFollowUp,
  templateGlossaryAsk,
  templateClosing,
} from "./templates";

export class TemplatedFallback implements LlmAdapter {
  name = "templated";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generateTurn(input: WalkThroughInput): Promise<AgentTurn> {
    const {
      surfacedItems,
      remainingCount,
      totalEntries,
      patterns,
      turnHistory,
      currentItemIndex,
      userAnswer,
      isTiredMode,
      actionableCount,
      thoughtCount,
    } = input;

    if (turnHistory.length === 0) {
      return {
        content: pickOpening(totalEntries, !!isTiredMode, actionableCount, thoughtCount),
        isOpening: true,
      };
    }

    if (userAnswer && currentItemIndex > 0) {
      const prevItem = surfacedItems[currentItemIndex - 1];
      if (prevItem) {
        const isNewCluster =
          prevItem.type === "cluster" &&
          prevItem.cluster &&
          !prevItem.glossary &&
          !prevItem.cluster.confirmed;

        const lastAgentTurn = turnHistory
          .filter((t) => t.role === "agent")
          .pop();
        const wasAskingGlossary = lastAgentTurn?.content.startsWith("what's '");

        if (isNewCluster && !wasAskingGlossary) {
          return {
            content: templateGlossaryAsk(prevItem.cluster!.label),
            askingForGlossary: true,
            askingAbout: { clusterId: prevItem.clusterId },
          };
        }
      }
    }

    if (currentItemIndex >= surfacedItems.length) {
      const closing = templateClosing(patterns, surfacedItems.length);
      if (closing) {
        return { content: closing, isClosing: true };
      }
      if (remainingCount > 0) {
        return {
          content: `${remainingCount} other notes. heard.`,
          isClosing: true,
        };
      }
      return { content: "that's tonight.", isClosing: true };
    }

    const item = surfacedItems[currentItemIndex];
    const pattern = patterns.find(
      (p) => p.clusterId === item.clusterId
    );

    if (item.type === "cluster") {
      return {
        content: templateClusterQuestion(item, pattern),
        askingAbout: {
          clusterId: item.clusterId,
          entryIds: item.entries.map((e) => e.id),
        },
      };
    }

    return {
      content: templateSingleQuestion(item),
      askingAbout: {
        entryIds: item.entries.map((e) => e.id),
      },
    };
  }
}
