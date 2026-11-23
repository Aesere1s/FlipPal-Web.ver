import { useParams } from 'react-router-dom';
import { PagePlaceholder } from '../components/PagePlaceholder';

export default function Learn() {
  const { cardId = 'preview' } = useParams<{ cardId: string }>();

  return (
    <PagePlaceholder
      no="02"
      label="学卡"
      en="LEARN"
      layer="L3"
      note={`正面、翻面、解释、60 秒小测与掌握度会在这里闭环。当前 cardId 占位：${cardId}。`}
    />
  );
}