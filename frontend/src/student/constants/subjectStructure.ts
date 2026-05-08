export interface Chapter {
  id: string
  display_name: string
}

export const SUBJECT_CHAPTERS: Record<string, Chapter[]> = {
  compulsory_math: [
    { id: 'sets', display_name: 'Sets' },
    { id: 'arithmetic', display_name: 'Arithmetic' },
    { id: 'algebra', display_name: 'Algebra' },
    { id: 'geometry', display_name: 'Geometry' },
    { id: 'trigonometry', display_name: 'Trigonometry' },
    { id: 'statistics', display_name: 'Statistics' },
    { id: 'probability', display_name: 'Probability' },
  ],
  compulsory_english: [
    { id: 'reading_comprehension', display_name: 'Reading Comprehension' },
    { id: 'grammar', display_name: 'Grammar' },
    { id: 'vocabulary', display_name: 'Vocabulary' },
    { id: 'writing', display_name: 'Writing Skills' },
  ],
  compulsory_science: [
    { id: 'physics_motion', display_name: 'Physics: Motion and Force' },
    { id: 'physics_energy', display_name: 'Physics: Work, Energy and Power' },
    { id: 'physics_light', display_name: 'Physics: Light' },
    { id: 'physics_electricity', display_name: 'Physics: Electricity and Magnetism' },
    { id: 'chemistry_matter', display_name: 'Chemistry: Matter and Its Properties' },
    { id: 'chemistry_reactions', display_name: 'Chemistry: Chemical Reactions' },
    { id: 'biology_life_processes', display_name: 'Biology: Life Processes' },
    { id: 'biology_heredity', display_name: 'Biology: Heredity and Evolution' },
    { id: 'biology_environment', display_name: 'Biology: Environment and Ecology' },
  ],
  optional_math: [
    { id: 'coordinate_geometry', display_name: 'Coordinate Geometry' },
    { id: 'trigonometry_advanced', display_name: 'Trigonometry' },
    { id: 'vectors', display_name: 'Vectors' },
    { id: 'matrices', display_name: 'Matrices and Determinants' },
    { id: 'calculus', display_name: 'Calculus' },
    { id: 'probability_advanced', display_name: 'Probability' },
  ],
}
