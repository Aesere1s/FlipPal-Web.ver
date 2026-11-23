import { useParams } from 'react-router-dom';
import { PagePlaceholder } from '../components/PagePlaceholder';

export default function Remake() {
  const { cardId = 'preview' } = useParams<{ cardId: string }>();

  return (
    <PagePlaceholder
      no="03"
      label="改卡"
      en="REMAKE"
      layer="L5"
      note={`四槽位改写、OC 挑刺与提交后的再修改会在这里发生。当前 cardId 占位：${cardId}。`}
    />
  );
}