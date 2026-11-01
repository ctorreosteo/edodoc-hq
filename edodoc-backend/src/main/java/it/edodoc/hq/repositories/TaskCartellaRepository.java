package it.edodoc.hq.repositories;

import it.edodoc.hq.models.TaskCartella;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskCartellaRepository extends JpaRepository<TaskCartella, Long> {
    boolean existsByParentId(Long parentId);
}
