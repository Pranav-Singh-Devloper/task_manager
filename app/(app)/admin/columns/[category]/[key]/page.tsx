import { ColumnFormScreen } from '@/components/admin/column-form-screen';

export default async function Page({
  params,
}: {
  params: Promise<{ category: string; key: string }>;
}) {
  const { category, key } = await params;
  return <ColumnFormScreen category={category} columnKey={key} />;
}
