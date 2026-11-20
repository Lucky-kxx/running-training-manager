import { z } from 'zod';

import { Injectable } from '@nestjs/common';

import {
  AiTask,
  COACH_CHAT_REPLY_LIMIT,
  CoachChatDto,
  CoachChatMessage,
  CoachChatReply,
  LOCAL_OLLAMA_PROVIDER,
} from '@openathlete/shared';

import { type AgentSpec, AiModelResolverService, AiService } from '../../ai';

const coach: AgentSpec = {
  id: 'training-coach-chat',
  name: 'Running coach',
  maxOutputTokens: 850,
  skipReasoning: true,
  instructions: `You are OpenAthlete's running coach. Have a natural, ongoing conversation about running, race preparation, training load, recovery, or injuries. You can talk even when the athlete has no workout to record.
Talk directly to the runner and return only the final reply. Use relevant details already shared in the conversation and avoid asking for them again. Answer in a few sentences or a short list, with at most one focused follow-up question when useful. Reply in the user's language.
For ordinary training questions, relate advice to the person's goal, recent routine and available time. Distinguish perceived effort from measured intensity. Do not invent distances, training history, studies or credentials.
For an injury, listen and help the athlete describe symptoms, triggers and guidance already given by their clinician. Explain general concepts in plain language. Do not diagnose, interpret imaging, prescribe medication, or clear the athlete to run. For a known or suspected bone injury without clinical clearance, clearly recommend postponing the requested run until the treating clinician assesses readiness. For unresolved symptoms, defer progression to a clinician or physiotherapist. Prioritize prompt medical assessment for severe or rapidly worsening pain, inability to bear weight after injury, deformity, or loss of sensation. Ask about relevant details without assuming any unreported activity or symptoms.
You can see only this conversation. You cannot open medical records, read their calendar, change their training plan, or save a note. Describe suggested actions without claiming to perform them.`,
};

const localCoachReply = z.object({ reply: z.string().trim().min(1).max(900) });

/** Keep the latest complete exchanges within the local model's context. */
export function recentCoachMessages(messages: CoachChatMessage[]) {
  let start = messages.length - 1;
  let characters = messages[start].content.length;
  while (start >= 2) {
    const previousExchange =
      messages[start - 2].content.length + messages[start - 1].content.length;
    if (characters + previousExchange > 4800) break;
    characters += previousExchange;
    start -= 2;
  }
  return messages.slice(start);
}

@Injectable()
export class TrainingCoachChatService {
  constructor(
    private readonly models: AiModelResolverService,
    private readonly ai: AiService,
  ) {}

  async reply(userId: number, input: CoachChatDto): Promise<CoachChatReply> {
    const model = input.localModel
      ? await this.models.resolveLocalForUser(
          AiTask.ACTIVITY_SUMMARY,
          userId,
          input.localModel,
        )
      : await this.models.resolveForUser(AiTask.ACTIVITY_SUMMARY, userId);
    const agent = input.chinese
      ? {
          ...coach,
          instructions: `${coach.instructions}\nUse Simplified Chinese unless the user requests another language.`,
        }
      : coach;
    const messages = recentCoachMessages(input.messages);
    if (model.provider === LOCAL_OLLAMA_PROVIDER) {
      return this.ai.generateObject(
        {
          ...agent,
          maxOutputTokens: 400,
          localInstructions: input.chinese
            ? `你是中长跑教练。用自然中文和跑者接着聊，结合对话里已有的训练、目标和恢复情况。只把最终给跑者的话放在 reply 中，直接对他说话，通常三到五句，必要时只问一个具体问题。不要假设用户没提到的症状、部位或活动，也不要声称能读日历或写记录。谈伤病时提供一般解释，不诊断、开药、解读影像或批准复跑。若已知或疑似骨损伤、医生还没同意复跑，明确建议先暂缓跑步并请医生评估，即使现在不痛也一样。若严重疼痛、受伤后不能负重、明显变形或麻木，优先就医。用户要求其他语言时按其要求。`
            : `${agent.instructions}\nPut only the final words addressed to the runner in the reply field.`,
        },
        model,
        messages,
        localCoachReply,
      );
    }
    const reply = await this.ai.generateText(agent, model, messages);
    return { reply: reply.trim().slice(0, COACH_CHAT_REPLY_LIMIT) };
  }
}
