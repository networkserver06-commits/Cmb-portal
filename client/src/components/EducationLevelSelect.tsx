import {
  EDUCATION_LEVEL_OPTIONS,
  type EducationLevel,
} from "@shared/educationLevels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function EducationLevelSelect({
  value,
  onChange,
  includeAll = false,
  className,
}: {
  value: EducationLevel | "";
  onChange: (value: EducationLevel | "") => void;
  includeAll?: boolean;
  className?: string;
}) {
  const selectValue = value || (includeAll ? "all" : "unselected");
  return (
    <Select
      value={selectValue}
      onValueChange={next =>
        onChange(
          next === "all" || next === "unselected"
            ? ""
            : (next as EducationLevel)
        )
      }
    >
      <SelectTrigger className={className}>
        <SelectValue
          placeholder={
            includeAll ? "All education levels" : "Choose education level"
          }
        />
      </SelectTrigger>
      <SelectContent>
        {includeAll && (
          <SelectItem value="all">All education levels</SelectItem>
        )}
        {!includeAll && (
          <SelectItem value="unselected">Choose education level</SelectItem>
        )}
        {EDUCATION_LEVEL_OPTIONS.map(option => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex flex-col text-left">
              <span>{option.label}</span>
              <span className="text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
