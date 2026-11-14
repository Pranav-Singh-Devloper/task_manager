import { ColumnFormScreen } from '@/components/admin/column-form-screen';

export default async function Page({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  return <ColumnFormScreen category={category} />;
}
