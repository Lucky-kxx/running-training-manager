import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';

export function useChineseCoach() {
  return getLocale() === 'zh-CN' || /^(zh)(-|$)/i.test(navigator.language);
}

export function coachCopy(chinese: boolean) {
  return {
    title: () => (chinese ? 'AI 教练' : m.training_coach_title()),
    intro: () =>
      chinese
        ? '说说刚跑完的感受，并带上 0 到 10 的 RPE。'
        : m.training_coach_intro(),
    example: () =>
      chinese
        ? '我今天跑完这个 10k 感觉非常累，RPE 8。'
        : m.training_coach_example(),
    date: () => (chinese ? '活动日期' : m.training_coach_date()),
    message: () => (chinese ? '跑后反馈' : m.training_coach_message()),
    save: () => (chinese ? '记录反馈' : m.training_coach_save()),
    invalid: () =>
      chinese
        ? '请写一个 0 到 10 的 RPE，例如 RPE 8。'
        : m.training_coach_invalid(),
    no_match: () =>
      chinese
        ? '这一天还没找到跑步记录。同步后点「记录反馈」重试，或调整活动日期。'
        : m.training_coach_no_match(),
    choose: () =>
      chinese ? '要把反馈记录到哪条活动？' : m.training_coach_choose(),
    replace: (previous: string, next: string) =>
      chinese
        ? `这条活动已有 RPE ${previous}，要改成 ${next} 吗？`
        : m.training_coach_replace({ previous, next }),
    replace_button: () =>
      chinese ? '替换 RPE 并保存' : m.training_coach_replace_button(),
    saved: (rpe: string) =>
      chinese
        ? `已保存 RPE ${rpe}/10 和跑后感受。`
        : m.training_coach_saved({ rpe }),
    activity: () => (chinese ? '打开活动' : m.training_coach_activity()),
    undo: () => (chinese ? '撤销反馈' : m.training_coach_undo()),
    undone: () => (chinese ? '已撤销本次反馈。' : m.training_coach_undone()),
    changed: () =>
      chinese
        ? '这条活动的反馈已被更新，请打开活动核对。'
        : m.training_coach_changed(),
    generate: () => (chinese ? '生成 AI 复盘' : m.training_coach_generate()),
    regenerate: () =>
      chinese ? '更新 AI 复盘' : m.training_coach_regenerate(),
    pending: () => (chinese ? '正在生成 AI 复盘…' : m.training_coach_pending()),
    failed: () =>
      chinese
        ? '复盘生成失败。可以重试，或检查 AI 设置。'
        : m.training_coach_failed(),
    settings: () => (chinese ? 'AI 设置' : m.training_coach_settings()),
    model: () =>
      chinese
        ? '请在 AI 设置里选择模型并开启 AI 数据访问，再生成复盘。'
        : m.training_coach_model(),
    speech: () => (chinese ? '语音输入' : m.training_coach_speech()),
    stop: () => (chinese ? '停止语音输入' : m.training_coach_stop()),
    voice_hint: () =>
      chinese
        ? '浏览器可能通过在线服务识别语音。检查转写文字后再保存。'
        : m.training_coach_voice_hint(),
    voice_error: () =>
      chinese
        ? '语音识别暂不可用。请检查麦克风权限，或直接输入文字。'
        : m.training_coach_voice_error(),
    request_error: () =>
      chinese ? '处理失败，请重试。' : m.training_coach_request_error(),
    recap_title: () => (chinese ? 'AI 复盘' : m.training_coach_recap_title()),
    next: () => (chinese ? '下次训练' : m.training_coach_next()),
  };
}
