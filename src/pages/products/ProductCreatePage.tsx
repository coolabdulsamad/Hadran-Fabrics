import { useNavigate } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProductForm } from "@/components/inventory/ProductForm";

export default function ProductCreatePage() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader
        title="Add New Product"
        description="Register a new item — every detail the store needs, from fabric material to shelf location. Manager submissions go to Admin for approval."
      />
      <ProductForm
        mode="create"
        onDone={(res) => {
          if (res.pending) navigate("/products");
          else navigate(`/products/${res.id}`);
        }}
      />
    </div>
  );
}
