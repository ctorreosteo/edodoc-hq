package it.edodoc.hq.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApiResponseDto<T> {
    private boolean success;
    private String message;
    private T data;
    private String error;

    public static <T> ApiResponseDto<T> success(T data) {
        return ApiResponseDto.<T>builder().success(true).data(data).build();
    }

    public static <T> ApiResponseDto<T> success(String message, T data) {
        return ApiResponseDto.<T>builder().success(true).message(message).data(data).build();
    }

    public static <T> ApiResponseDto<T> error(String message, String error) {
        return ApiResponseDto.<T>builder().success(false).message(message).error(error).build();
    }
}
