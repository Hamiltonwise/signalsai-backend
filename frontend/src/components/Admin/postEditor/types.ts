export interface SchemaField {
  name: string;
  slug: string;
  type: string;
  required?: boolean;
  default_value?: unknown;
  options?: string[];
}

export interface GalleryItem {
  id: string;
  url: string;
  link?: string;
  alt: string;
  caption?: string;
}

export interface FieldEditorProps<T> {
  field: SchemaField;
  value: T;
  onChange: (next: T) => void;
  projectId: string;
}
