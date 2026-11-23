import { PagePlaceholder } from '../components/PagePlaceholder';

export default function Draw() {
  return (
    <PagePlaceholder
      no="01"
      label="抽卡"
      en="DRAW"
      layer="L2"
      note="每日 3 张、重抽 1 次、翻牌动画与稀有度标记，都还没有装填。"
    />
  );
}